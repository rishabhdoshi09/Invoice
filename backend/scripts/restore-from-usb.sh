#!/bin/bash
# ============================================================
#  FULL RESTORE FROM USB — Invoice System (Mac)
#  Run: bash restore-from-usb.sh
#
#  Restores EVERYTHING to the EXACT same state as the backup:
#    1.  Project source code → same folder it was in
#    2.  .env  (credentials, JWT secret)
#    3.  PostgreSQL database
#    4.  uploads / media files
#    5.  frontend/build
#    6.  npm install + migrations
#
#  After restore the app will be exactly where it was.
# ============================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✔${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
step()    { echo -e "\n${BOLD}── $* ──${NC}"; }
die()     { echo -e "\n${RED}✘ ERROR:${NC} $*" >&2; echo "Press Enter to close..."; read -r; exit 1; }
ask()     { echo -n -e "${YELLOW}?${NC}  $* "; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$BACKEND_DIR/.." && pwd)"
ENV_FILE="$BACKEND_DIR/.env"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     Invoice System — Restore from USB        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
warn "This will restore files and database from a USB backup."
warn "Existing data will be OVERWRITTEN."
echo ""
ask "Type YES to continue: "
read -r confirm
[ "$confirm" = "YES" ] || { echo "Cancelled."; exit 0; }

# ── Find USB drive with InvoiceBackups ───────────────────────
step "Finding USB drive"

ALL_USB=()
while IFS= read -r line; do
    [[ "$line" =~ ^(/dev/disk[0-9]+)[[:space:]]*\(external.*physical ]]] || continue
    disk="${BASH_REMATCH[1]}"
    while IFS= read -r vol; do
        [ -d "$vol" ] && ALL_USB+=("$vol")
    done < <(diskutil list "$disk" 2>/dev/null \
             | awk '/Apple_HFS|Windows_NTFS|ExFAT|DOS_FAT|Apple_APFS/{print $NF}' \
             | while read -r id; do
                 mp=$(diskutil info "$id" 2>/dev/null | awk -F': +' '/Mount Point/{print $2}')
                 echo "$mp"
               done)
done < <(diskutil list external physical 2>/dev/null)

if [ ${#ALL_USB[@]} -eq 0 ]; then
    while IFS= read -r vol; do
        protocol=$(diskutil info "$vol" 2>/dev/null | awk -F': +' '/Protocol/{print $2}')
        removable=$(diskutil info "$vol" 2>/dev/null | awk -F': +' '/Removable Media/{print $2}')
        if [[ "$protocol" =~ USB|SD|Thunderbolt ]] || [[ "$removable" =~ Removable|Yes ]]; then
            ALL_USB+=("$vol")
        fi
    done < <(find /Volumes -maxdepth 1 -mindepth 1 -type d 2>/dev/null)
fi

USB_DRIVES=()
for vol in "${ALL_USB[@]}"; do
    [ -d "$vol/InvoiceBackups" ] && USB_DRIVES+=("$vol")
done

[ ${#USB_DRIVES[@]} -gt 0 ] || die "No USB pendrive with InvoiceBackups found.\nInsert the pendrive you used for backup and try again."

if [ ${#USB_DRIVES[@]} -eq 1 ]; then
    PENDRIVE="${USB_DRIVES[0]}"
    info "Drive: ${BOLD}$(basename "$PENDRIVE")${NC}"
else
    echo "Multiple drives found:"
    for i in "${!USB_DRIVES[@]}"; do echo "  [$((i+1))] ${USB_DRIVES[$i]}"; done
    ask "Select drive number:"
    read -r ch; PENDRIVE="${USB_DRIVES[$((ch-1))]}"
fi

BACKUP_ROOT="$PENDRIVE/InvoiceBackups"

# ── List backups newest first ─────────────────────────────────
BACKUPS=()
while IFS= read -r dir; do BACKUPS+=("$dir"); done \
    < <(find "$BACKUP_ROOT" -maxdepth 1 -mindepth 1 -type d | sort -r)

[ ${#BACKUPS[@]} -gt 0 ] || die "No backups found on drive."

echo ""
echo -e "${BOLD}Available backups (newest first):${NC}"
for i in "${!BACKUPS[@]}"; do
    ts=$(basename "${BACKUPS[$i]}")
    sz=$(du -sh "${BACKUPS[$i]}" | cut -f1)
    # Show what's inside
    has_db=""; has_src=""; has_upl=""
    [ -f "${BACKUPS[$i]}/database_"*.sql.gz ] 2>/dev/null && has_db=" DB" || true
    [ -d "${BACKUPS[$i]}/source" ]  && has_src=" Source"
    [ -d "${BACKUPS[$i]}/uploads" ] && has_upl=" Uploads"
    echo "  [$((i+1))] $ts  ($sz) —${has_db}${has_src}${has_upl}"
done
echo ""
ask "Select backup (default 1 = newest):"
read -r choice; choice="${choice:-1}"
BACKUP_DIR="${BACKUPS[$((choice-1))]}"
TIMESTAMP=$(basename "$BACKUP_DIR")

info "Restoring from: $TIMESTAMP"
[ -f "$BACKUP_DIR/MANIFEST.txt" ] && echo "" && cat "$BACKUP_DIR/MANIFEST.txt" | head -12 && echo ""

echo ""
ask "Confirm restore of this backup? (YES/no):"
read -r c2; [ "${c2:-YES}" = "YES" ] || { echo "Cancelled."; exit 0; }

START_TIME=$(date +%s)

# ════════════════════════════════════════════════════════════
# 1. SOURCE CODE
# ════════════════════════════════════════════════════════════
step "1/5  Restoring source code"
if [ -d "$BACKUP_DIR/source" ]; then

    # Read the original project path from MANIFEST if possible
    ORIGINAL_PATH=$(grep "Project Dir" "$BACKUP_DIR/MANIFEST.txt" 2>/dev/null | awk -F': ' '{print $2}' | xargs || echo "")

    if [ -n "$ORIGINAL_PATH" ] && [ "$ORIGINAL_PATH" != "$PROJECT_DIR" ]; then
        warn "Backup was from: $ORIGINAL_PATH"
        warn "Current location: $PROJECT_DIR"
        ask "Restore to original path $ORIGINAL_PATH? (y/N):"
        read -r rp
        if [[ "$rp" =~ ^[Yy]$ ]]; then
            RESTORE_TARGET="$ORIGINAL_PATH"
            mkdir -p "$RESTORE_TARGET"
        else
            RESTORE_TARGET="$PROJECT_DIR"
        fi
    else
        RESTORE_TARGET="$PROJECT_DIR"
    fi

    rsync -a --delete \
        --exclude="node_modules/" \
        --exclude=".git/" \
        --exclude="frontend/build/" \
        --exclude=".DS_Store" \
        "$BACKUP_DIR/source/" "$RESTORE_TARGET/"

    # Update SCRIPT_DIR and BACKEND_DIR to point to restored location
    BACKEND_DIR="$RESTORE_TARGET/backend"
    PROJECT_DIR="$RESTORE_TARGET"
    ENV_FILE="$BACKEND_DIR/.env"

    success "Source code restored to $RESTORE_TARGET"
else
    warn "No source code in this backup — skipping"
fi

# ════════════════════════════════════════════════════════════
# 2. .env
# ════════════════════════════════════════════════════════════
step "2/5  Restoring .env"
if [ -f "$BACKUP_DIR/env.backup" ]; then
    [ -f "$ENV_FILE" ] && cp "$ENV_FILE" "$ENV_FILE.pre-restore-$(date +%s)"
    cp "$BACKUP_DIR/env.backup" "$ENV_FILE"
    success ".env restored"
    # Reload env
    set -a; source "$ENV_FILE"; set +a
    DB_NAME="${DATABASE_NAME:-customerInvoice}"
    DB_USER="${DB_USER:-Rishabh}"
    DB_PASS="${PASSWORD:-}"
    DB_HOST="${DB_HOST:-127.0.0.1}"
    DB_PORT="${DB_PORT:-5432}"
else
    warn "No .env backup found — using existing .env"
    [ -f "$ENV_FILE" ] || die ".env not found. Cannot proceed without credentials."
    set -a; source "$ENV_FILE"; set +a
    DB_NAME="${DATABASE_NAME:-customerInvoice}"; DB_USER="${DB_USER:-Rishabh}"
    DB_PASS="${PASSWORD:-}"; DB_HOST="${DB_HOST:-127.0.0.1}"; DB_PORT="${DB_PORT:-5432}"
fi

# ════════════════════════════════════════════════════════════
# 3. DATABASE
# ════════════════════════════════════════════════════════════
step "3/5  Restoring database"
DB_FILE=$(find "$BACKUP_DIR" -name "*.sql.gz" 2>/dev/null | head -1)

if [ -n "$DB_FILE" ]; then
    info "File: $(basename "$DB_FILE") ($(du -sh "$DB_FILE" | cut -f1))"

    # Ensure DB exists
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
        -d postgres --no-password -c "CREATE DATABASE \"$DB_NAME\";" 2>/dev/null || true

    # Restore
    gunzip -c "$DB_FILE" | PGPASSWORD="$DB_PASS" psql \
        -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --no-password -q 2>&1 | grep -vE "^$|already exists|does not exist|^NOTICE" || true

    success "Database '$DB_NAME' restored"
else
    warn "No database dump found in this backup — skipping"
fi

# ════════════════════════════════════════════════════════════
# 4. UPLOADS / MEDIA
# ════════════════════════════════════════════════════════════
step "4/5  Restoring uploads"
if [ -d "$BACKUP_DIR/uploads" ]; then
    for udir in "$BACKUP_DIR/uploads"/*/; do
        name=$(basename "$udir")
        DEST="$BACKEND_DIR/$name"
        mkdir -p "$DEST"
        rsync -a "$udir" "$DEST/"
        success "uploads/$name restored"
    done
else
    info "No uploads in this backup — skipping"
fi

# ════════════════════════════════════════════════════════════
# 5. FRONTEND BUILD
# ════════════════════════════════════════════════════════════
step "5/5  Restoring frontend build"
if [ -d "$BACKUP_DIR/frontend-build" ]; then
    FBUILD="$PROJECT_DIR/frontend/build"
    mkdir -p "$FBUILD"
    rsync -a --delete "$BACKUP_DIR/frontend-build/" "$FBUILD/"
    success "Frontend build restored"
else
    info "No frontend build in backup — you may need to run: cd frontend && npm run build"
fi

# ════════════════════════════════════════════════════════════
# npm install (restore node_modules)
# ════════════════════════════════════════════════════════════
step "Installing dependencies"
if [ -f "$BACKEND_DIR/package.json" ]; then
    info "Running npm install in backend..."
    (cd "$BACKEND_DIR" && npm install --silent 2>/dev/null)
    success "Backend dependencies installed"
fi
if [ -f "$PROJECT_DIR/frontend/package.json" ]; then
    ask "Install frontend dependencies too? (y/N):"
    read -r fi_ans
    if [[ "$fi_ans" =~ ^[Yy]$ ]]; then
        (cd "$PROJECT_DIR/frontend" && npm install --silent 2>/dev/null)
        success "Frontend dependencies installed"
    fi
fi

# ════════════════════════════════════════════════════════════
# Run pending migrations
# ════════════════════════════════════════════════════════════
step "Running database migrations"
if command -v npx &>/dev/null && [ -f "$BACKEND_DIR/.sequelizerc" ]; then
    (cd "$BACKEND_DIR" && npx sequelize-cli db:migrate 2>&1) && success "Migrations up to date"
else
    warn "sequelize-cli not found — run migrations manually: cd backend && npx sequelize-cli db:migrate"
fi

# ════════════════════════════════════════════════════════════
# DONE
# ════════════════════════════════════════════════════════════
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       RESTORE COMPLETE  ✅                   ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "   Restored from : $TIMESTAMP"
echo -e "   Project at    : $PROJECT_DIR"
echo -e "   Duration       : ${ELAPSED}s"
echo ""
echo -e "   ${BOLD}Start the server:${NC}"
echo -e "   cd $(basename "$PROJECT_DIR")/backend && node index.js"
echo ""

osascript -e "display notification \"Restore complete in ${ELAPSED}s\" with title \"Invoice Restore\" subtitle \"SUCCESS ✅\"" 2>/dev/null || true

echo "Press Enter to close..."
read -r
