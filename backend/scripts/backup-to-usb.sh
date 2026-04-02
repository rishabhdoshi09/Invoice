#!/bin/bash
# ============================================================
#  ONE-CLICK USB BACKUP — Invoice System
#  Double-click this file in Finder (or run: bash backup-to-usb.sh)
#
#  What it saves:
#    1. Full PostgreSQL database dump (customerInvoice)
#    2. .env file (credentials + config)
#    3. Sequelize migrations state
#
#  Backup folder on USB:
#    <PENDRIVE>/InvoiceBackups/YYYY-MM-DD_HH-MM-SS/
# ============================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; notify_fail "$*"; exit 1; }

notify_ok()   { osascript -e "display notification \"$1\" with title \"Invoice Backup\" subtitle \"SUCCESS ✅\"" 2>/dev/null || true; }
notify_fail() { osascript -e "display notification \"$1\" with title \"Invoice Backup\" subtitle \"FAILED ❌\"" 2>/dev/null || true; }

# ── Locate this script's directory (works from any CWD) ──────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$BACKEND_DIR/.env"

echo ""
echo -e "${BOLD}================================================${NC}"
echo -e "${BOLD}  Invoice System — USB Backup${NC}"
echo -e "${BOLD}================================================${NC}"
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

# ── Auto-detect USB drives ───────────────────────────────────
info "Scanning for USB drives in /Volumes/ ..."

# Exclude system volumes (Macintosh HD, Recovery, VM, Preboot, Update, Data)
SYSTEM_VOLUMES="Macintosh HD|Recovery|VM|Preboot|Update|Data|com.apple"

USB_DRIVES=()
while IFS= read -r vol; do
    name=$(basename "$vol")
    if echo "$name" | grep -vqE "$SYSTEM_VOLUMES"; then
        USB_DRIVES+=("$vol")
    fi
done < <(find /Volumes -maxdepth 1 -mindepth 1 -type d 2>/dev/null)

if [ ${#USB_DRIVES[@]} -eq 0 ]; then
    die "No USB drive found. Insert your pendrive and try again."
fi

# If multiple drives found, ask user to pick
if [ ${#USB_DRIVES[@]} -eq 1 ]; then
    SELECTED_DRIVE="${USB_DRIVES[0]}"
    info "USB drive detected: ${BOLD}$SELECTED_DRIVE${NC}"
else
    echo -e "${YELLOW}Multiple drives found. Select one:${NC}"
    for i in "${!USB_DRIVES[@]}"; do
        echo "  [$((i+1))] ${USB_DRIVES[$i]}"
    done
    echo -n "Enter number: "
    read -r choice
    idx=$((choice - 1))
    if [ "$idx" -lt 0 ] || [ "$idx" -ge "${#USB_DRIVES[@]}" ]; then
        die "Invalid choice."
    fi
    SELECTED_DRIVE="${USB_DRIVES[$idx]}"
fi

# ── Check drive is writable ───────────────────────────────────
if [ ! -w "$SELECTED_DRIVE" ]; then
    die "Drive $SELECTED_DRIVE is not writable. Check if it's locked."
fi

# ── Create timestamped backup folder ─────────────────────────
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_ROOT="$SELECTED_DRIVE/InvoiceBackups"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"
info "Backup folder: $BACKUP_DIR"

# ── Check available space (need at least 100 MB) ─────────────
AVAIL_KB=$(df -k "$SELECTED_DRIVE" | awk 'NR==2 {print $4}')
if [ "$AVAIL_KB" -lt 102400 ]; then
    die "Not enough space on USB drive. Free at least 100 MB."
fi

echo ""
echo -e "${BOLD}Starting backup...${NC}"
echo ""

# ── 1. Database dump ─────────────────────────────────────────
info "Dumping database '$DB_NAME'..."
DB_FILE="$BACKUP_DIR/database_${DB_NAME}_${TIMESTAMP}.sql.gz"

PGPASSWORD="$DB_PASS" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-password \
    --format=plain \
    --clean \
    --if-exists \
    2>/dev/null | gzip > "$DB_FILE"

DB_SIZE=$(du -sh "$DB_FILE" | cut -f1)
success "Database dump saved ($DB_SIZE) → $(basename "$DB_FILE")"

# ── 2. .env file ─────────────────────────────────────────────
info "Saving .env ..."
cp "$ENV_FILE" "$BACKUP_DIR/env.backup"
success ".env saved"

# ── 3. Migration state ────────────────────────────────────────
info "Saving migration state..."
PGPASSWORD="$DB_PASS" psql \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-password -t -A \
    -c "SELECT name FROM \"SequelizeMeta\" ORDER BY name;" \
    2>/dev/null > "$BACKUP_DIR/migrations_applied.txt" || true
success "Migration list saved"

# ── 4. Write backup manifest ──────────────────────────────────
cat > "$BACKUP_DIR/MANIFEST.txt" << MANIFEST
Invoice System Backup
=====================
Timestamp  : $TIMESTAMP
Database   : $DB_NAME
DB Host    : $DB_HOST:$DB_PORT
DB User    : $DB_USER
DB Dump    : $(basename "$DB_FILE") ($DB_SIZE)
Machine    : $(hostname)
macOS      : $(sw_vers -productVersion 2>/dev/null || echo unknown)

Files in this backup:
$(ls -lh "$BACKUP_DIR")

To restore, run:
  bash restore-from-usb.sh
MANIFEST

success "Manifest written"

# ── 5. Verify dump is non-empty ───────────────────────────────
DUMP_BYTES=$(wc -c < "$DB_FILE")
if [ "$DUMP_BYTES" -lt 1000 ]; then
    die "Dump file is suspiciously small ($DUMP_BYTES bytes). Backup may have failed."
fi

# ── Cleanup old backups (keep last 10) ───────────────────────
BACKUP_COUNT=$(find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
if [ "$BACKUP_COUNT" -gt 10 ]; then
    info "Cleaning up old backups (keeping last 10)..."
    find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d | \
        sort | head -n $((BACKUP_COUNT - 10)) | xargs rm -rf
fi

# ── Summary ───────────────────────────────────────────────────
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo ""
echo -e "${BOLD}================================================${NC}"
echo -e "${GREEN}${BOLD}  BACKUP COMPLETE ✅${NC}"
echo -e "${BOLD}================================================${NC}"
echo -e "  Drive   : $SELECTED_DRIVE"
echo -e "  Folder  : InvoiceBackups/$TIMESTAMP"
echo -e "  Size    : $TOTAL_SIZE"
echo -e "  Backups : $(find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ') total on drive"
echo -e "${BOLD}================================================${NC}"
echo ""

notify_ok "Saved to $(basename "$SELECTED_DRIVE") — $TOTAL_SIZE"

# Keep terminal open if double-clicked from Finder
if [ "${1:-}" != "--no-pause" ]; then
    echo "Press Enter to close..."
    read -r
fi
