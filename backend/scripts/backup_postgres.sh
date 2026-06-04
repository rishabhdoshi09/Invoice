#!/bin/bash
# PostgreSQL Backup Script
# Credentials are read exclusively from environment variables — never hardcoded.
# Required env vars: PASSWORD, DB_USER, DATABASE_NAME
# Optional env vars: DB_HOST (default 127.0.0.1), DB_PORT (default 5432)

BACKUP_DIR="/app/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql.gz"
RETENTION_DAYS=7

# ── Validate required environment variables ───────────────────────────────────
DB_PASS="${PASSWORD:-}"
DB_USER="${DB_USER:-}"
DB_NAME="${DATABASE_NAME:-}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"

if [ -z "$DB_PASS" ] || [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
    echo "ERROR: Required environment variables not set."
    echo "  Please export PASSWORD, DB_USER, and DATABASE_NAME before running this script."
    echo "  Example: source /path/to/.env && bash scripts/backup_postgres.sh"
    exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "Starting PostgreSQL backup at $(date)"

# Create backup — password via env var only, never inline
PGPASSWORD="$DB_PASS" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "Backup created: $BACKUP_FILE"
    echo "Size: $(du -h "$BACKUP_FILE" | cut -f1)"
else
    echo "ERROR: Backup failed!"
    rm -f "$BACKUP_FILE"
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
