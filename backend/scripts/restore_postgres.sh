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
