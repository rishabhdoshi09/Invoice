#!/bin/bash
# =============================================================================
# PostgreSQL Crash Simulation & Recovery Test
# =============================================================================
# This script simulates a pod crash and verifies data persistence
# =============================================================================

set -e

PERSISTENT_PGDATA="/app/pgdata"
PG_VERSION="15"
LOG_FILE="/app/logs/crash_test_$(date +%Y%m%d_%H%M%S).log"
TEST_MARKER="CRASH_TEST_$(date +%Y%m%d_%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

# Create log directory
mkdir -p /app/logs

log "${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${YELLOW}║     POSTGRESQL CRASH SIMULATION & RECOVERY TEST              ║${NC}"
log "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
log ""
log "Test ID: $TEST_MARKER"
log "Started: $(date)"
log ""

# =============================================================================
# PHASE 1: Pre-Crash State Capture
# =============================================================================

log "${YELLOW}═══ PHASE 1: PRE-CRASH STATE CAPTURE ═══${NC}"
log ""

# Verify PostgreSQL is running
if /usr/lib/postgresql/$PG_VERSION/bin/pg_isready -h 127.0.0.1 -q; then
    log "${GREEN}✓ PostgreSQL is running${NC}"
else
    log "${RED}✗ PostgreSQL is NOT running - cannot proceed${NC}"
    exit 1
fi

# Verify persistent storage is being used
CURRENT_DATADIR=$(grep "^data_directory" /etc/postgresql/$PG_VERSION/main/postgresql.conf | cut -d"'" -f2)
if [ "$CURRENT_DATADIR" == "$PERSISTENT_PGDATA" ]; then
    log "${GREEN}✓ Using persistent storage: $PERSISTENT_PGDATA${NC}"
else
    log "${RED}✗ NOT using persistent storage!${NC}"
    log "  Current: $CURRENT_DATADIR"
    log "  Expected: $PERSISTENT_PGDATA"
    exit 1
fi

# Capture pre-crash state
log ""
log "Capturing pre-crash database state..."

PRE_CRASH_STATE=$(PGPASSWORD=yttriumR psql -h 127.0.0.1 -U Rishabh -d customerInvoice -t << EOF
SELECT json_build_object(
    'order_count', (SELECT COUNT(*) FROM orders),
    'total_sales', (SELECT COALESCE(SUM(total), 0) FROM orders),
    'customer_count', (SELECT COUNT(*) FROM customers),
    'product_count', (SELECT COUNT(*) FROM products),
    'crash_test_orders', (SELECT COUNT(*) FROM orders WHERE "orderNumber" LIKE 'CRASH-TEST%'),
    'persistence_marker', (SELECT test_id FROM persistence_test WHERE test_id LIKE 'CRASH_TEST%' LIMIT 1)
);
EOF
)

log "Pre-crash state:"
echo "$PRE_CRASH_STATE" | python3 -m json.tool 2>/dev/null || echo "$PRE_CRASH_STATE"

# Store state for comparison
PRE_ORDER_COUNT=$(echo "$PRE_CRASH_STATE" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip())['order_count'])")
PRE_TOTAL_SALES=$(echo "$PRE_CRASH_STATE" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip())['total_sales'])")
PRE_CRASH_ORDERS=$(echo "$PRE_CRASH_STATE" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip())['crash_test_orders'])")
PRE_MARKER=$(echo "$PRE_CRASH_STATE" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip())['persistence_marker'] or 'None')")

log ""
log "Summary:"
log "  - Total Orders: $PRE_ORDER_COUNT"
log "  - Total Sales: ₹$PRE_TOTAL_SALES"
log "  - Crash Test Orders: $PRE_CRASH_ORDERS"
log "  - Persistence Marker: $PRE_MARKER"

# =============================================================================
# PHASE 2: Force Checkpoint and Sync
# =============================================================================

log ""
log "${YELLOW}═══ PHASE 2: FORCE CHECKPOINT & SYNC ═══${NC}"
log ""

log "Forcing PostgreSQL checkpoint (sync all data to disk)..."
PGPASSWORD=yttriumR psql -h 127.0.0.1 -U Rishabh -d customerInvoice -c "CHECKPOINT;" > /dev/null
log "${GREEN}✓ Checkpoint completed${NC}"

log "Syncing filesystem..."
sync
log "${GREEN}✓ Filesystem synced${NC}"

# =============================================================================
# PHASE 3: Simulate Crash (Kill PostgreSQL Abruptly)
# =============================================================================

log ""
log "${YELLOW}═══ PHASE 3: SIMULATING CRASH ═══${NC}"
log ""

log "${RED}Killing PostgreSQL process abruptly (SIGKILL)...${NC}"

# Get PostgreSQL process IDs
PG_PIDS=$(pgrep -f "postgres" | tr '\n' ' ')
log "PostgreSQL PIDs to kill: $PG_PIDS"

# Kill PostgreSQL abruptly (simulating crash)
sudo pkill -9 -f "postgres" 2>/dev/null || true

sleep 2

# Verify PostgreSQL is dead
if pgrep -f "postgres" > /dev/null; then
    log "${RED}✗ PostgreSQL processes still running!${NC}"
else
    log "${GREEN}✓ PostgreSQL killed successfully (crash simulated)${NC}"
fi

# Verify data files are intact
if [ -f "$PERSISTENT_PGDATA/PG_VERSION" ]; then
    log "${GREEN}✓ Data directory intact: $PERSISTENT_PGDATA${NC}"
    log "  Size: $(du -sh "$PERSISTENT_PGDATA" | cut -f1)"
else
    log "${RED}✗ Data directory MISSING!${NC}"
    exit 1
fi

# =============================================================================
# PHASE 4: Recovery (Restart PostgreSQL)
# =============================================================================

log ""
log "${YELLOW}═══ PHASE 4: RECOVERY ═══${NC}"
log ""

log "Starting PostgreSQL from persistent storage..."

# Ensure correct ownership after crash
sudo chown -R postgres:postgres "$PERSISTENT_PGDATA"
sudo chmod 700 "$PERSISTENT_PGDATA"

# Start PostgreSQL
sudo pg_ctlcluster $PG_VERSION main start

# Wait for PostgreSQL to be ready
log "Waiting for PostgreSQL to recover..."
RECOVERY_START=$(date +%s)
MAX_WAIT=60

for i in $(seq 1 $MAX_WAIT); do
    if /usr/lib/postgresql/$PG_VERSION/bin/pg_isready -h 127.0.0.1 -q 2>/dev/null; then
        RECOVERY_END=$(date +%s)
        RECOVERY_TIME=$((RECOVERY_END - RECOVERY_START))
        log "${GREEN}✓ PostgreSQL recovered in ${RECOVERY_TIME} seconds${NC}"
        break
    fi
    
    if [ $i -eq $MAX_WAIT ]; then
        log "${RED}✗ PostgreSQL failed to recover within $MAX_WAIT seconds${NC}"
        exit 1
    fi
    
    echo -n "."
    sleep 1
done

# =============================================================================
# PHASE 5: Data Integrity Verification
# =============================================================================

log ""
log "${YELLOW}═══ PHASE 5: DATA INTEGRITY VERIFICATION ═══${NC}"
log ""

# Capture post-recovery state
log "Capturing post-recovery database state..."

POST_CRASH_STATE=$(PGPASSWORD=yttriumR psql -h 127.0.0.1 -U Rishabh -d customerInvoice -t << EOF
SELECT json_build_object(
    'order_count', (SELECT COUNT(*) FROM orders),
    'total_sales', (SELECT COALESCE(SUM(total), 0) FROM orders),
    'customer_count', (SELECT COUNT(*) FROM customers),
    'product_count', (SELECT COUNT(*) FROM products),
    'crash_test_orders', (SELECT COUNT(*) FROM orders WHERE "orderNumber" LIKE 'CRASH-TEST%'),
    'persistence_marker', (SELECT test_id FROM persistence_test WHERE test_id LIKE 'CRASH_TEST%' LIMIT 1)
);
EOF
)

log "Post-recovery state:"
echo "$POST_CRASH_STATE" | python3 -m json.tool 2>/dev/null || echo "$POST_CRASH_STATE"

# Extract values
POST_ORDER_COUNT=$(echo "$POST_CRASH_STATE" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip())['order_count'])")
POST_TOTAL_SALES=$(echo "$POST_CRASH_STATE" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip())['total_sales'])")
POST_CRASH_ORDERS=$(echo "$POST_CRASH_STATE" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip())['crash_test_orders'])")
POST_MARKER=$(echo "$POST_CRASH_STATE" | python3 -c "import sys,json; print(json.loads(sys.stdin.read().strip())['persistence_marker'] or 'None')")

# =============================================================================
# PHASE 6: Comparison & Results
# =============================================================================

log ""
log "${YELLOW}═══ PHASE 6: COMPARISON & RESULTS ═══${NC}"
log ""

TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: Order count
if [ "$PRE_ORDER_COUNT" == "$POST_ORDER_COUNT" ]; then
    log "${GREEN}✓ Order count preserved: $PRE_ORDER_COUNT → $POST_ORDER_COUNT${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    log "${RED}✗ Order count MISMATCH: $PRE_ORDER_COUNT → $POST_ORDER_COUNT${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Test 2: Total sales
if [ "$PRE_TOTAL_SALES" == "$POST_TOTAL_SALES" ]; then
    log "${GREEN}✓ Total sales preserved: ₹$PRE_TOTAL_SALES → ₹$POST_TOTAL_SALES${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    log "${RED}✗ Total sales MISMATCH: ₹$PRE_TOTAL_SALES → ₹$POST_TOTAL_SALES${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Test 3: Crash test orders
if [ "$PRE_CRASH_ORDERS" == "$POST_CRASH_ORDERS" ]; then
    log "${GREEN}✓ Crash test orders preserved: $PRE_CRASH_ORDERS → $POST_CRASH_ORDERS${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    log "${RED}✗ Crash test orders MISMATCH: $PRE_CRASH_ORDERS → $POST_CRASH_ORDERS${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Test 4: Persistence marker
if [ "$PRE_MARKER" == "$POST_MARKER" ]; then
    log "${GREEN}✓ Persistence marker preserved: $PRE_MARKER${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    log "${RED}✗ Persistence marker MISMATCH: $PRE_MARKER → $POST_MARKER${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# =============================================================================
# FINAL REPORT
# =============================================================================

log ""
log "${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}"
log "${YELLOW}║                    FINAL TEST REPORT                         ║${NC}"
log "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}"
log ""
log "Test ID: $TEST_MARKER"
log "Completed: $(date)"
log ""
log "Tests Passed: $TESTS_PASSED"
log "Tests Failed: $TESTS_FAILED"
log ""

if [ $TESTS_FAILED -eq 0 ]; then
    log "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    log "${GREEN}       ✅ ALL TESTS PASSED - DATA PERSISTENCE VERIFIED!        ${NC}"
    log "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    log ""
    log "The database successfully survived a simulated crash."
    log "All data was recovered intact from persistent storage."
    log ""
    EXIT_CODE=0
else
    log "${RED}═══════════════════════════════════════════════════════════════${NC}"
    log "${RED}       ❌ TESTS FAILED - DATA INTEGRITY COMPROMISED!            ${NC}"
    log "${RED}═══════════════════════════════════════════════════════════════${NC}"
    log ""
    log "WARNING: Some data may have been lost during the crash."
    log "Review the log file: $LOG_FILE"
    log ""
    EXIT_CODE=1
fi

log "Log file: $LOG_FILE"

exit $EXIT_CODE
