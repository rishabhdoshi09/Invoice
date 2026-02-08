#!/bin/bash
# =============================================================================
# PostgreSQL Initialization Script (Pod Startup)
# =============================================================================
# This script ensures PostgreSQL uses persistent storage on pod startup.
# Add this to your entrypoint or supervisor configuration.
#
# Usage: sudo bash /app/backend/scripts/init_postgres.sh
# =============================================================================

PERSISTENT_PGDATA="/app/pgdata"
PG_VERSION="15"
LOG_FILE="/app/logs/postgres_init.log"

mkdir -p /app/logs
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=============================================="
echo "PostgreSQL Initialization"
echo "$(date)"
echo "=============================================="

# Check if PostgreSQL is installed
if [ ! -f "/usr/lib/postgresql/$PG_VERSION/bin/postgres" ]; then
    echo "[INFO] PostgreSQL not installed, installing..."
    apt-get update && apt-get install -y postgresql postgresql-contrib
fi

# Check for persistent data
if [ -d "$PERSISTENT_PGDATA" ] && [ -f "$PERSISTENT_PGDATA/PG_VERSION" ]; then
    echo "[INFO] Found persistent PostgreSQL data at $PERSISTENT_PGDATA"
    
    # Ensure correct ownership
    chown -R postgres:postgres "$PERSISTENT_PGDATA"
    chmod 700 "$PERSISTENT_PGDATA"
    
    # Update PostgreSQL config to use persistent storage
    PG_CONF="/etc/postgresql/$PG_VERSION/main/postgresql.conf"
    if [ -f "$PG_CONF" ]; then
        sed -i "s|^data_directory = .*|data_directory = '$PERSISTENT_PGDATA'|" "$PG_CONF"
        echo "[INFO] Updated PostgreSQL config to use persistent storage"
    fi
    
    # Start PostgreSQL
    echo "[INFO] Starting PostgreSQL..."
    pg_ctlcluster $PG_VERSION main start
    
    # Wait for ready
    for i in {1..30}; do
        if /usr/lib/postgresql/$PG_VERSION/bin/pg_isready -h 127.0.0.1 -q; then
            echo "[SUCCESS] PostgreSQL started from persistent storage"
            
            # Show summary
            echo ""
            echo "Data directory: $PERSISTENT_PGDATA"
            echo "Data size: $(du -sh "$PERSISTENT_PGDATA" | cut -f1)"
            
            # Check database
            if PGPASSWORD=yttriumR psql -h 127.0.0.1 -U Rishabh -d customerInvoice -c "SELECT 1" > /dev/null 2>&1; then
                ORDER_COUNT=$(PGPASSWORD=yttriumR psql -h 127.0.0.1 -U Rishabh -d customerInvoice -t -c "SELECT COUNT(*) FROM orders" 2>/dev/null | tr -d ' ')
                echo "Orders in database: $ORDER_COUNT"
            fi
            
            exit 0
        fi
        sleep 1
    done
    
    echo "[ERROR] PostgreSQL failed to start"
    exit 1
else
    echo "[WARNING] No persistent data found at $PERSISTENT_PGDATA"
    echo "[INFO] Running full setup..."
    
    # Run full setup
    if [ -f "/app/backend/scripts/setup_postgres_persistent.sh" ]; then
        bash /app/backend/scripts/setup_postgres_persistent.sh
    else
        echo "[ERROR] Setup script not found!"
        exit 1
    fi
fi
