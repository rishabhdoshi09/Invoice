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
