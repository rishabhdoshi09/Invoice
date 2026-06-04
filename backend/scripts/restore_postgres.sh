#!/bin/bash
# PostgreSQL Restore Script
# Credentials are read exclusively from environment variables — never hardcoded.
# Required env vars: PASSWORD, DB_USER, DATABASE_NAME
# Optional env vars: DB_HOST (default 127.0.0.1), DB_PORT (default 5432)

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

# ── Validate required environment variables ───────────────────────────────────
DB_PASS="${PASSWORD:-}"
DB_USER="${DB_USER:-}"
DB_NAME="${DATABASE_NAME:-}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"

if [ -z "$DB_PASS" ] || [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
    echo "ERROR: Required environment variables not set."
    echo "  Please export PASSWORD, DB_USER, and DATABASE_NAME before running this script."
    echo "  Example: source /path/to/.env && bash scripts/restore_postgres.sh <backup_file>"
    exit 1
fi

echo "WARNING: This will DROP and recreate the $DB_NAME database!"
echo "Backup file: $BACKUP_FILE"
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

echo "Starting restore at $(date)"

# Drop and recreate database — password via env var only
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" postgres << EOF
DROP DATABASE IF EXISTS "$DB_NAME";
CREATE DATABASE "$DB_NAME" OWNER "$DB_USER";
EOF

# Restore from backup
gunzip -c "$BACKUP_FILE" | PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"

if [ $? -eq 0 ]; then
    echo "Restore completed successfully at $(date)"
else
    echo "ERROR: Restore failed!"
    exit 1
fi
