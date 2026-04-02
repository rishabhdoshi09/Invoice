#!/bin/bash
# ============================================================
#  RESTORE FROM USB BACKUP — Invoice System
#  Run: bash restore-from-usb.sh
#
#  Restores PostgreSQL database from a backup made by
#  backup-to-usb.sh
# ============================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$BACKEND_DIR/.env"

echo ""
echo -e "${BOLD}================================================${NC}"
echo -e "${BOLD}  Invoice System — Restore from USB${NC}"
echo -e "${BOLD}================================================${NC}"
echo ""
echo -e "${RED}${BOLD}  ⚠  WARNING: This will OVERWRITE the current database.${NC}"
echo -e "${RED}${BOLD}     Make a backup first if you have unsaved data.${NC}"
echo ""
echo -n "  Type YES to continue: "
read -r confirm
if [ "$confirm" != "YES" ]; then
    echo "Cancelled."
    exit 0
fi
echo ""

# ── Load .env ────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    die ".env not found at $ENV_FILE"
fi
set -a; source "$ENV_FILE"; set +a

DB_NAME="${DATABASE_NAME:-customerInvoice}"
DB_USER="${DB_USER:-Rishabh}"
DB_PASS="${PASSWORD:-}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"

# ── Find USB drive ────────────────────────────────────────────
SYSTEM_VOLUMES="Macintosh HD|Recovery|VM|Preboot|Update|Data|com.apple"
USB_DRIVES=()
while IFS= read -r vol; do
    name=$(basename "$vol")
    if echo "$name" | grep -vqE "$SYSTEM_VOLUMES"; then
        if [ -d "$vol/InvoiceBackups" ]; then
            USB_DRIVES+=("$vol")
        fi
    fi
done < <(find /Volumes -maxdepth 1 -mindepth 1 -type d 2>/dev/null)

if [ ${#USB_DRIVES[@]} -eq 0 ]; then
    die "No USB drive with InvoiceBackups folder found."
fi

if [ ${#USB_DRIVES[@]} -eq 1 ]; then
    SELECTED_DRIVE="${USB_DRIVES[0]}"
else
    echo "Multiple drives found:"
    for i in "${!USB_DRIVES[@]}"; do
        echo "  [$((i+1))] ${USB_DRIVES[$i]}"
    done
    echo -n "Select drive: "
    read -r choice
    SELECTED_DRIVE="${USB_DRIVES[$((choice-1))]}"
fi

BACKUP_ROOT="$SELECTED_DRIVE/InvoiceBackups"

# ── List available backups ────────────────────────────────────
BACKUPS=()
while IFS= read -r dir; do
    BACKUPS+=("$dir")
done < <(find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d | sort -r)

if [ ${#BACKUPS[@]} -eq 0 ]; then
    die "No backups found in $BACKUP_ROOT"
fi

echo ""
echo -e "${BOLD}Available backups (newest first):${NC}"
for i in "${!BACKUPS[@]}"; do
    ts=$(basename "${BACKUPS[$i]}")
    sz=$(du -sh "${BACKUPS[$i]}" | cut -f1)
    echo "  [$((i+1))] $ts  ($sz)"
done
echo ""
echo -n "Select backup to restore (default: 1 = newest): "
read -r choice
choice="${choice:-1}"
SELECTED_BACKUP="${BACKUPS[$((choice-1))]}"

# Find the .sql.gz file
DB_FILE=$(find "$SELECTED_BACKUP" -name "*.sql.gz" | head -1)
if [ -z "$DB_FILE" ]; then
    die "No .sql.gz file found in $SELECTED_BACKUP"
fi

info "Restoring from: $(basename "$SELECTED_BACKUP")"
info "DB file: $(basename "$DB_FILE") ($(du -sh "$DB_FILE" | cut -f1))"
echo ""

# ── Restore database ──────────────────────────────────────────
info "Restoring database '$DB_NAME'..."
gunzip -c "$DB_FILE" | PGPASSWORD="$DB_PASS" psql \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-password -q \
    2>&1 | grep -v "^$\|already exists\|does not exist" || true

success "Database restored"

# ── Optionally restore .env ───────────────────────────────────
if [ -f "$SELECTED_BACKUP/env.backup" ]; then
    echo ""
    echo -n "Restore .env from backup? (y/N): "
    read -r restore_env
    if [[ "$restore_env" =~ ^[Yy]$ ]]; then
        cp "$ENV_FILE" "$ENV_FILE.before-restore"
        cp "$SELECTED_BACKUP/env.backup" "$ENV_FILE"
        success ".env restored (old one saved as .env.before-restore)"
    fi
fi

echo ""
echo -e "${BOLD}================================================${NC}"
echo -e "${GREEN}${BOLD}  RESTORE COMPLETE ✅${NC}"
echo -e "${BOLD}================================================${NC}"
echo -e "  Restored from : $(basename "$SELECTED_BACKUP")"
echo -e "  Database      : $DB_NAME"
echo -e "${BOLD}================================================${NC}"
echo ""
echo "Restart the server:  node index.js"
echo ""

if [ "${1:-}" != "--no-pause" ]; then
    echo "Press Enter to close..."
    read -r
fi
