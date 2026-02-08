#!/bin/bash
# =============================================================================
# PostgreSQL Persistent Storage Setup Script
# =============================================================================
# This script configures PostgreSQL to use persistent storage at /app/pgdata
# ensuring data survives pod restarts.
#
# Run with: sudo bash /app/backend/scripts/setup_postgres_persistent.sh
# =============================================================================

set -e

PERSISTENT_PGDATA="/app/pgdata"
ORIGINAL_PGDATA="/var/lib/postgresql/15/main"
PG_VERSION="15"
BACKUP_DIR="/app/backups/postgres"
LOG_FILE="/app/logs/postgres_setup.log"

# Create log directory
mkdir -p /app/logs
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=============================================="
echo "PostgreSQL Persistent Storage Setup"
echo "Started at: $(date)"
echo "=============================================="

# Function to check if PostgreSQL is running
pg_is_running() {
    /usr/lib/postgresql/$PG_VERSION/bin/pg_isready -h 127.0.0.1 -q 2>/dev/null
    return $?
}

# Function to stop PostgreSQL
stop_postgres() {
    echo "[INFO] Stopping PostgreSQL..."
    sudo pg_ctlcluster $PG_VERSION main stop 2>/dev/null || true
    sleep 2
}

# Function to start PostgreSQL
start_postgres() {
    echo "[INFO] Starting PostgreSQL..."
    sudo pg_ctlcluster $PG_VERSION main start
    sleep 3
    
    if pg_is_running; then
        echo "[SUCCESS] PostgreSQL started successfully"
    else
        echo "[ERROR] Failed to start PostgreSQL"
        return 1
    fi
}

# Check if persistent storage is already configured
check_existing_setup() {
    if [ -d "$PERSISTENT_PGDATA" ] && [ -f "$PERSISTENT_PGDATA/PG_VERSION" ]; then
        echo "[INFO] Persistent PostgreSQL data directory found at $PERSISTENT_PGDATA"
        return 0
    fi
    return 1
}

# Create persistent data directory
setup_persistent_storage() {
    echo "[INFO] Setting up persistent storage at $PERSISTENT_PGDATA"
    
    # Create directory with correct permissions
    mkdir -p "$PERSISTENT_PGDATA"
    chown postgres:postgres "$PERSISTENT_PGDATA"
    chmod 700 "$PERSISTENT_PGDATA"
    
    # Check if there's existing data in the original location
    if [ -f "$ORIGINAL_PGDATA/PG_VERSION" ]; then
        echo "[INFO] Copying existing data from $ORIGINAL_PGDATA to $PERSISTENT_PGDATA"
        
        # Stop PostgreSQL first
        stop_postgres
        
        # Copy data
        cp -a "$ORIGINAL_PGDATA"/* "$PERSISTENT_PGDATA"/ 2>/dev/null || true
        
        echo "[SUCCESS] Data copied to persistent storage"
    else
        echo "[INFO] No existing data found, initializing new cluster"
        
        # Initialize new cluster in persistent location
        sudo -u postgres /usr/lib/postgresql/$PG_VERSION/bin/initdb -D "$PERSISTENT_PGDATA" --encoding=UTF8 --locale=en_US.UTF-8
        
        # Configure authentication
        echo "host all all 127.0.0.1/32 md5" >> "$PERSISTENT_PGDATA/pg_hba.conf"
        echo "local all all trust" >> "$PERSISTENT_PGDATA/pg_hba.conf"
    fi
}

# Update PostgreSQL configuration to use persistent storage
update_pg_config() {
    echo "[INFO] Updating PostgreSQL configuration..."
    
    local PG_CONF="/etc/postgresql/$PG_VERSION/main/postgresql.conf"
    
    # Backup original config
    cp "$PG_CONF" "$PG_CONF.backup.$(date +%Y%m%d%H%M%S)"
    
    # Update data_directory
    sed -i "s|^data_directory = .*|data_directory = '$PERSISTENT_PGDATA'|" "$PG_CONF"
    
    # Verify the change
    if grep -q "data_directory = '$PERSISTENT_PGDATA'" "$PG_CONF"; then
        echo "[SUCCESS] PostgreSQL configured to use $PERSISTENT_PGDATA"
    else
        echo "[ERROR] Failed to update PostgreSQL configuration"
        return 1
    fi
}

# Create backup directory and script
setup_backup() {
    echo "[INFO] Setting up backup infrastructure..."
    
    mkdir -p "$BACKUP_DIR"
    chown postgres:postgres "$BACKUP_DIR"
    
    # Create backup script
    cat > /app/backend/scripts/backup_postgres.sh << 'BACKUP_SCRIPT'
#!/bin/bash
# PostgreSQL Backup Script
BACKUP_DIR="/app/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql.gz"
RETENTION_DAYS=7

echo "Starting PostgreSQL backup at $(date)"

# Create backup
PGPASSWORD=yttriumR pg_dump -h 127.0.0.1 -U Rishabh customerInvoice | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "Backup created: $BACKUP_FILE"
    echo "Size: $(du -h "$BACKUP_FILE" | cut -f1)"
else
    echo "ERROR: Backup failed!"
    exit 1
fi

# Remove old backups
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "Cleaned up backups older than $RETENTION_DAYS days"

# List recent backups
echo ""
echo "Recent backups:"
ls -lht "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -5

echo "Backup completed at $(date)"
BACKUP_SCRIPT

    chmod +x /app/backend/scripts/backup_postgres.sh
    
    echo "[SUCCESS] Backup infrastructure ready"
}

# Create restore script
setup_restore() {
    echo "[INFO] Creating restore script..."
    
    cat > /app/backend/scripts/restore_postgres.sh << 'RESTORE_SCRIPT'
#!/bin/bash
# PostgreSQL Restore Script
BACKUP_DIR="/app/backups/postgres"

if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lht "$BACKUP_DIR"/*.sql.gz 2>/dev/null
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "WARNING: This will DROP and recreate the customerInvoice database!"
echo "Backup file: $BACKUP_FILE"
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

echo "Starting restore at $(date)"

# Drop and recreate database
PGPASSWORD=yttriumR psql -h 127.0.0.1 -U Rishabh postgres << EOF
DROP DATABASE IF EXISTS "customerInvoice";
CREATE DATABASE "customerInvoice" OWNER "Rishabh";
EOF

# Restore from backup
gunzip -c "$BACKUP_FILE" | PGPASSWORD=yttriumR psql -h 127.0.0.1 -U Rishabh customerInvoice

if [ $? -eq 0 ]; then
    echo "Restore completed successfully at $(date)"
else
    echo "ERROR: Restore failed!"
    exit 1
fi
RESTORE_SCRIPT

    chmod +x /app/backend/scripts/restore_postgres.sh
    
    echo "[SUCCESS] Restore script created"
}

# Create startup script for supervisor
create_startup_script() {
    echo "[INFO] Creating PostgreSQL startup script for supervisor..."
    
    cat > /app/backend/scripts/start_postgres.sh << 'STARTUP_SCRIPT'
#!/bin/bash
# PostgreSQL Startup Script for Supervisor
# Ensures PostgreSQL uses persistent storage

PERSISTENT_PGDATA="/app/pgdata"
PG_VERSION="15"

echo "PostgreSQL startup script running at $(date)"

# Check if PostgreSQL package is installed
if [ ! -f "/usr/lib/postgresql/$PG_VERSION/bin/postgres" ]; then
    echo "Installing PostgreSQL..."
    apt-get update && apt-get install -y postgresql postgresql-contrib
fi

# Check if persistent data exists
if [ -d "$PERSISTENT_PGDATA" ] && [ -f "$PERSISTENT_PGDATA/PG_VERSION" ]; then
    echo "Using persistent data from $PERSISTENT_PGDATA"
    
    # Ensure correct ownership
    chown -R postgres:postgres "$PERSISTENT_PGDATA"
    chmod 700 "$PERSISTENT_PGDATA"
    
    # Update config to point to persistent data
    sed -i "s|^data_directory = .*|data_directory = '$PERSISTENT_PGDATA'|" /etc/postgresql/$PG_VERSION/main/postgresql.conf
else
    echo "ERROR: No persistent data found at $PERSISTENT_PGDATA"
    echo "Run setup_postgres_persistent.sh first"
    exit 1
fi

# Start PostgreSQL
echo "Starting PostgreSQL..."
pg_ctlcluster $PG_VERSION main start

# Wait for PostgreSQL to be ready
for i in {1..30}; do
    if /usr/lib/postgresql/$PG_VERSION/bin/pg_isready -h 127.0.0.1 -q; then
        echo "PostgreSQL is ready!"
        exit 0
    fi
    echo "Waiting for PostgreSQL... ($i/30)"
    sleep 1
done

echo "ERROR: PostgreSQL failed to start"
exit 1
STARTUP_SCRIPT

    chmod +x /app/backend/scripts/start_postgres.sh
    
    echo "[SUCCESS] Startup script created"
}

# Create health check script
create_health_check() {
    echo "[INFO] Creating health check script..."
    
    cat > /app/backend/scripts/postgres_health.sh << 'HEALTH_SCRIPT'
#!/bin/bash
# PostgreSQL Health Check Script

PERSISTENT_PGDATA="/app/pgdata"

echo "PostgreSQL Health Check - $(date)"
echo "=================================="

# Check if data directory exists
if [ -d "$PERSISTENT_PGDATA" ]; then
    echo "✓ Persistent data directory exists: $PERSISTENT_PGDATA"
    echo "  Size: $(du -sh "$PERSISTENT_PGDATA" | cut -f1)"
else
    echo "✗ Persistent data directory NOT found!"
fi

# Check PostgreSQL process
if pgrep -x postgres > /dev/null; then
    echo "✓ PostgreSQL process is running"
else
    echo "✗ PostgreSQL process is NOT running"
fi

# Check connection
if /usr/lib/postgresql/15/bin/pg_isready -h 127.0.0.1 -q 2>/dev/null; then
    echo "✓ PostgreSQL is accepting connections"
else
    echo "✗ PostgreSQL is NOT accepting connections"
fi

# Check database
if PGPASSWORD=yttriumR psql -h 127.0.0.1 -U Rishabh -d customerInvoice -c "SELECT 1" > /dev/null 2>&1; then
    echo "✓ Database 'customerInvoice' is accessible"
    
    # Count records
    ORDER_COUNT=$(PGPASSWORD=yttriumR psql -h 127.0.0.1 -U Rishabh -d customerInvoice -t -c "SELECT COUNT(*) FROM orders" 2>/dev/null | tr -d ' ')
    echo "  Orders in database: $ORDER_COUNT"
else
    echo "✗ Database 'customerInvoice' is NOT accessible"
fi

# Check backup status
BACKUP_DIR="/app/backups/postgres"
if [ -d "$BACKUP_DIR" ]; then
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        echo "✓ Backups exist - Latest: $(basename "$LATEST_BACKUP")"
    else
        echo "⚠ No backups found"
    fi
else
    echo "⚠ Backup directory not created"
fi

echo "=================================="
HEALTH_SCRIPT

    chmod +x /app/backend/scripts/postgres_health.sh
    
    echo "[SUCCESS] Health check script created"
}

# Main execution
main() {
    echo ""
    echo "[STEP 1] Checking existing setup..."
    
    if check_existing_setup; then
        echo "[INFO] Persistent storage already configured"
        
        # Just update config and restart
        update_pg_config
        start_postgres
    else
        echo "[STEP 2] Setting up persistent storage..."
        setup_persistent_storage
        
        echo "[STEP 3] Updating PostgreSQL configuration..."
        update_pg_config
        
        echo "[STEP 4] Starting PostgreSQL..."
        start_postgres
    fi
    
    echo "[STEP 5] Setting up backup infrastructure..."
    setup_backup
    setup_restore
    
    echo "[STEP 6] Creating utility scripts..."
    create_startup_script
    create_health_check
    
    echo ""
    echo "=============================================="
    echo "PostgreSQL Persistent Storage Setup Complete!"
    echo "=============================================="
    echo ""
    echo "Data directory: $PERSISTENT_PGDATA"
    echo "Backup directory: $BACKUP_DIR"
    echo ""
    echo "Available commands:"
    echo "  - Backup:  /app/backend/scripts/backup_postgres.sh"
    echo "  - Restore: /app/backend/scripts/restore_postgres.sh <backup_file>"
    echo "  - Health:  /app/backend/scripts/postgres_health.sh"
    echo ""
    echo "Completed at: $(date)"
}

# Run main function
main
