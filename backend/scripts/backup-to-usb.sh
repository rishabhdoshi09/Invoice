#!/bin/bash
# ============================================================
#  ONE-CLICK FULL BACKUP TO USB — Invoice System (Mac)
#  Double-click in Finder, or: bash scripts/backup-to-usb.sh
#
#  Backs up EVERYTHING needed to fully restore on any machine:
#    1.  PostgreSQL full database dump
#    2.  .env  (credentials, JWT secret, config)
#    3.  Full project source code  (excl. node_modules / .git)
#    4.  uploads/  directory  (if it exists)
#    5.  frontend/build/  (compiled React app, if present)
#    6.  Migration state
#    7.  MANIFEST + restore instructions
#
#  Backup location on pendrive:
#    <USB>/InvoiceBackups/YYYY-MM-DD_HH-MM-SS/
#
#  Keeps last 10 backups; older ones are auto-deleted.
# ============================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${BLUE}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✔${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
step()    { echo -e "\n${BOLD}── $* ──${NC}"; }
die()     { echo -e "\n${RED}✘ ERROR:${NC} $*" >&2
            osascript -e "display notification \"$*\" with title \"Invoice Backup\" subtitle \"FAILED ❌\"" 2>/dev/null || true
            echo "Press Enter to close..."; read -r; exit 1; }
notify()  { osascript -e "display notification \"$1\" with title \"Invoice Backup\" subtitle \"$2\"" 2>/dev/null || true; }

# ── Locate project root ───────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$BACKEND_DIR/.." && pwd)"
ENV_FILE="$BACKEND_DIR/.env"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     Invoice System — Full USB Backup         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
info "Project : $PROJECT_DIR"

# ── Load .env ────────────────────────────────────────────────
[ -f "$ENV_FILE" ] || die ".env not found at $ENV_FILE"
set -a; source "$ENV_FILE"; set +a

DB_NAME="${DATABASE_NAME:-customerInvoice}"
DB_USER="${DB_USER:-Rishabh}"
DB_PASS="${PASSWORD:-}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"

# ── Auto-detect USB drive ─────────────────────────────────────
step "Detecting USB drive"
SYSTEM_VOLS="Macintosh HD|Recovery|VM|Preboot|Update|Data|com.apple"
USB_DRIVES=()
while IFS= read -r vol; do
    [[ "$(basename "$vol")" =~ $SYSTEM_VOLS ]] && continue
    USB_DRIVES+=("$vol")
done < <(find /Volumes -maxdepth 1 -mindepth 1 -type d 2>/dev/null)

[ ${#USB_DRIVES[@]} -gt 0 ] || die "No USB drive found. Insert your pendrive and try again."

if [ ${#USB_DRIVES[@]} -eq 1 ]; then
    PENDRIVE="${USB_DRIVES[0]}"
    info "Detected: ${BOLD}$(basename "$PENDRIVE")${NC} ($PENDRIVE)"
else
    echo -e "${YELLOW}Multiple drives found — pick one:${NC}"
    for i in "${!USB_DRIVES[@]}"; do
        echo "  [$((i+1))] ${USB_DRIVES[$i]}"
    done
    echo -n "Enter number: "
    read -r choice
    PENDRIVE="${USB_DRIVES[$((choice-1))]}"
fi

[ -w "$PENDRIVE" ] || die "Drive is not writable. Check if it is locked."

# ── Check free space ──────────────────────────────────────────
AVAIL_MB=$(df -m "$PENDRIVE" | awk 'NR==2{print $4}')
PROJECT_MB=$(du -sm "$PROJECT_DIR" --exclude="$PROJECT_DIR/backend/node_modules" \
              --exclude="$PROJECT_DIR/frontend/node_modules" \
              --exclude="$PROJECT_DIR/.git" 2>/dev/null | cut -f1 || echo 500)

if [ "$AVAIL_MB" -lt $((PROJECT_MB + 100)) ]; then
    die "Not enough space. Need ~$((PROJECT_MB+100)) MB, only $AVAIL_MB MB free."
fi

# ── Create backup folder ──────────────────────────────────────
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_ROOT="$PENDRIVE/InvoiceBackups"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"
info "Backup folder: InvoiceBackups/$TIMESTAMP"

START_TIME=$(date +%s)
ITEMS_BACKED=()

# ════════════════════════════════════════════════════════════
# 1. DATABASE DUMP
# ════════════════════════════════════════════════════════════
step "1/5  Database dump"
DB_FILE="$BACKUP_DIR/database_${DB_NAME}.sql.gz"

PGPASSWORD="$DB_PASS" pg_dump \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-password --format=plain --clean --if-exists \
    2>/dev/null | gzip > "$DB_FILE"

DUMP_BYTES=$(wc -c < "$DB_FILE")
[ "$DUMP_BYTES" -gt 500 ] || die "DB dump is suspiciously small. Is PostgreSQL running?"
DB_SIZE=$(du -sh "$DB_FILE" | cut -f1)
success "Database saved ($DB_SIZE)"
ITEMS_BACKED+=("Database: $DB_SIZE")

# ════════════════════════════════════════════════════════════
# 2. .env FILE
# ════════════════════════════════════════════════════════════
step "2/5  Configuration (.env)"
cp "$ENV_FILE" "$BACKUP_DIR/env.backup"
success ".env saved"
ITEMS_BACKED+=(".env config")

# ════════════════════════════════════════════════════════════
# 3. PROJECT SOURCE CODE
# ════════════════════════════════════════════════════════════
step "3/5  Project source code"
SOURCE_DIR="$BACKUP_DIR/source"
mkdir -p "$SOURCE_DIR"

# rsync everything except node_modules, .git, build artifacts
rsync -a --info=progress2 \
    --exclude="node_modules/" \
    --exclude=".git/" \
    --exclude="frontend/build/" \
    --exclude="backend/scripts/backup-to-usb.sh.bak" \
    --exclude="*.pyc" \
    --exclude="__pycache__/" \
    --exclude=".DS_Store" \
    "$PROJECT_DIR/" "$SOURCE_DIR/" 2>/dev/null

SRC_SIZE=$(du -sh "$SOURCE_DIR" | cut -f1)
success "Source code saved ($SRC_SIZE)"
ITEMS_BACKED+=("Source code: $SRC_SIZE")

# ════════════════════════════════════════════════════════════
# 4. UPLOADS / MEDIA (if present)
# ════════════════════════════════════════════════════════════
step "4/5  Uploads & media files"
UPLOADS_FOUND=false
for upload_path in \
    "$BACKEND_DIR/uploads" \
    "$BACKEND_DIR/media" \
    "$BACKEND_DIR/files" \
    "$PROJECT_DIR/uploads" \
    "$PROJECT_DIR/media"
do
    if [ -d "$upload_path" ] && [ "$(ls -A "$upload_path" 2>/dev/null)" ]; then
        DEST="$BACKUP_DIR/uploads/$(basename "$upload_path")"
        mkdir -p "$DEST"
        rsync -a "$upload_path/" "$DEST/"
        UPL_SIZE=$(du -sh "$DEST" | cut -f1)
        success "$(basename "$upload_path")/ saved ($UPL_SIZE)"
        ITEMS_BACKED+=("Uploads ($(basename "$upload_path")): $UPL_SIZE")
        UPLOADS_FOUND=true
    fi
done
$UPLOADS_FOUND || info "No uploads directory found — skipping"

# ════════════════════════════════════════════════════════════
# 5. FRONTEND BUILD (compiled React app)
# ════════════════════════════════════════════════════════════
step "5/5  Frontend build"
FRONTEND_BUILD="$PROJECT_DIR/frontend/build"
if [ -d "$FRONTEND_BUILD" ] && [ "$(ls -A "$FRONTEND_BUILD" 2>/dev/null)" ]; then
    BUILD_DEST="$BACKUP_DIR/frontend-build"
    rsync -a "$FRONTEND_BUILD/" "$BUILD_DEST/"
    BUILD_SIZE=$(du -sh "$BUILD_DEST" | cut -f1)
    success "Frontend build saved ($BUILD_SIZE)"
    ITEMS_BACKED+=("Frontend build: $BUILD_SIZE")
else
    info "No frontend build found — skipping (run npm run build to create one)"
fi

# ════════════════════════════════════════════════════════════
# MIGRATION STATE
# ════════════════════════════════════════════════════════════
PGPASSWORD="$DB_PASS" psql \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-password -t -A \
    -c "SELECT name FROM \"SequelizeMeta\" ORDER BY name;" \
    2>/dev/null > "$BACKUP_DIR/migrations_applied.txt" || true

# ════════════════════════════════════════════════════════════
# MANIFEST + RESTORE INSTRUCTIONS
# ════════════════════════════════════════════════════════════
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)

cat > "$BACKUP_DIR/MANIFEST.txt" << MANIFEST
Invoice System — Full Backup
============================
Timestamp   : $TIMESTAMP
Machine     : $(hostname)
macOS       : $(sw_vers -productVersion 2>/dev/null || echo unknown)
Project Dir : $PROJECT_DIR
Database    : $DB_NAME @ $DB_HOST:$DB_PORT
Backup Size : $TOTAL_SIZE
Duration    : ${ELAPSED}s

Contents:
$(for item in "${ITEMS_BACKED[@]}"; do echo "  • $item"; done)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO RESTORE ON A NEW MACHINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Install prerequisites:
   - Node.js 18+  : https://nodejs.org
   - PostgreSQL   : brew install postgresql
   - Git          : comes with Xcode tools

2. Copy source from this pendrive:
   cp -r <USB>/InvoiceBackups/$TIMESTAMP/source/ ~/Documents/UltimateInvoice/

3. Run the restore script:
   bash ~/Documents/UltimateInvoice/backend/scripts/restore-from-usb.sh

   (The script will find this backup automatically if the pendrive is inserted)
MANIFEST

# ════════════════════════════════════════════════════════════
# CLEANUP OLD BACKUPS (keep last 10)
# ════════════════════════════════════════════════════════════
BACKUP_COUNT=$(find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')
if [ "$BACKUP_COUNT" -gt 10 ]; then
    TO_DELETE=$((BACKUP_COUNT - 10))
    info "Removing $TO_DELETE old backup(s)..."
    find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d | sort | head -n "$TO_DELETE" | xargs rm -rf
fi

# ════════════════════════════════════════════════════════════
# DONE
# ════════════════════════════════════════════════════════════
REMAINING=$(find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d | wc -l | tr -d ' ')

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       BACKUP COMPLETE  ✅                    ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
for item in "${ITEMS_BACKED[@]}"; do echo -e "   ${GREEN}✔${NC}  $item"; done
echo ""
echo -e "   Drive    : $(basename "$PENDRIVE")"
echo -e "   Folder   : InvoiceBackups/$TIMESTAMP"
echo -e "   Total    : $TOTAL_SIZE  (${ELAPSED}s)"
echo -e "   Backups  : $REMAINING stored on drive"
echo ""

notify "Saved to $(basename "$PENDRIVE") — $TOTAL_SIZE in ${ELAPSED}s" "SUCCESS ✅"

echo "Press Enter to close..."
read -r
