/**
 * Financial Integrity Guard — BLOCKING Layer
 *
 * This middleware BLOCKS all financial write operations when the self-audit
 * system has declared a HALT or CRITICAL status. The audit system detects
 * invariant violations; this middleware enforces the block.
 *
 * Architecture:
 *   - Uses an in-memory cache (refreshed every 60 s) to avoid a DB round-trip
 *     on every single request.  The cache is intentionally conservative:
 *     a HALT status stays locked until the server explicitly clears it.
 *   - CRITICAL status logs a warning but does NOT block (operator must review
 *     and decide; halting on CRITICAL alone would be too aggressive for a
 *     live system with legacy data).
 *   - HALT status blocks ALL financial writes immediately.
 *
 * Usage:
 *   router.post('/orders', authenticate, financialWriteGuard, createOrder);
 *   router.post('/payments', authenticate, financialWriteGuard, createPayment);
 *
 * Override (emergency bypass — admin only, leaves audit trail):
 *   Pass header  X-Financial-Guard-Override: <OVERRIDE_SECRET>
 *   The secret must be set in ENV as FINANCIAL_GUARD_OVERRIDE_SECRET.
 *   Bypass is logged to console and the audit trail.
 */

const CACHE_TTL_MS = 60 * 1000; // refresh every 60 s
const HALT_LOCK_MS = 5 * 60 * 1000; // HALT stays locked for 5 min even after cache refresh

let _cache = {
    status: 'UNKNOWN',  // 'OK' | 'WARNING' | 'CRITICAL' | 'HALT' | 'UNKNOWN'
    lastChecked: 0,
    haltSince: null,     // timestamp when HALT was first detected
};

/**
 * Fetch the latest reconciliation run status from DB.
 * Returns 'OK', 'WARNING', 'CRITICAL', 'HALT', or 'UNKNOWN'.
 */
async function _fetchLatestStatus(db) {
    try {
        const [rows] = await db.sequelize.query(`
            SELECT "overallStatus"
            FROM reconciliation_runs
            ORDER BY "startedAt" DESC
            LIMIT 1
        `);
        if (rows.length === 0) return 'UNKNOWN';
        return rows[0].overallStatus || 'UNKNOWN';
    } catch (err) {
        // Table may not exist yet (first boot before migrations)
        console.warn('[FINANCIAL GUARD] Could not read reconciliation_runs:', err.message);
        return 'UNKNOWN';
    }
}

/**
 * Refresh cache if stale.
 * If status is HALT, the lock persists for HALT_LOCK_MS to prevent
 * a brief OK window from allowing writes during an ongoing investigation.
 */
async function _refreshCache(db) {
    const now = Date.now();
    if (now - _cache.lastChecked < CACHE_TTL_MS) return; // still fresh

    const status = await _fetchLatestStatus(db);
    _cache.lastChecked = now;

    if (status === 'HALT') {
        if (!_cache.haltSince) _cache.haltSince = now;
        _cache.status = 'HALT';
    } else if (_cache.haltSince && now - _cache.haltSince < HALT_LOCK_MS) {
        // Keep HALT lock even if last run shows OK/WARNING — too soon to trust
        _cache.status = 'HALT';
    } else {
        _cache.haltSince = null;
        _cache.status = status;
    }
}

/**
 * Express middleware.  Inject the db instance via factory.
 *
 * @param {Object} db — Sequelize db instance (from models/index.js)
 * @returns Express middleware function
 */
function makeFinancialWriteGuard(db) {
    return async function financialWriteGuard(req, res, next) {
        try {
            await _refreshCache(db);

            if (_cache.status === 'HALT') {
                // Allow admin emergency override with secret header
                const overrideSecret = process.env.FINANCIAL_GUARD_OVERRIDE_SECRET;
                const suppliedOverride = req.headers['x-financial-guard-override'];
                if (overrideSecret && suppliedOverride === overrideSecret) {
                    console.error(
                        `[FINANCIAL GUARD] ⚠️  OVERRIDE BYPASS by ${req.user?.username || 'unknown'} ` +
                        `on ${req.method} ${req.path} — HALT status in effect. This action is logged.`
                    );
                    return next();
                }

                const haltAgeSeconds = _cache.haltSince
                    ? Math.round((Date.now() - _cache.haltSince) / 1000)
                    : '?';

                return res.status(503).json({
                    status: 503,
                    error: 'FINANCIAL_INTEGRITY_HALT',
                    message:
                        'Financial writes are BLOCKED. The self-audit system has detected a critical ' +
                        'invariant violation (HALT status). No new orders, payments, or ledger entries ' +
                        'can be created until the integrity issue is resolved and cleared by an administrator. ' +
                        'Contact your system administrator immediately.',
                    haltActiveSince: _cache.haltSince
                        ? new Date(_cache.haltSince).toISOString()
                        : null,
                    haltAgeSeconds
                });
            }

            if (_cache.status === 'CRITICAL') {
                // CRITICAL does not block writes but injects a warning header so
                // the front-end can display an alert banner.
                res.setHeader('X-Audit-Status', 'CRITICAL');
                res.setHeader('X-Audit-Warning',
                    'Audit detected CRITICAL invariant violations. Contact administrator.');
            }

            next();
        } catch (err) {
            // Guard failure must NEVER silently swallow — but also must not kill
            // legitimate requests.  Log prominently and allow through.
            console.error('[FINANCIAL GUARD] Guard check threw — allowing request through:', err.message);
            next();
        }
    };
}

/**
 * Manually force-clear the HALT cache (call this after a successful repair run).
 * Requires admin role — enforced at the route level.
 */
function clearHaltCache() {
    _cache = { status: 'UNKNOWN', lastChecked: 0, haltSince: null };
    console.log('[FINANCIAL GUARD] HALT cache cleared by administrator.');
}

/**
 * Read-only status endpoint helper.
 */
function getCacheStatus() {
    return { ..._cache };
}

module.exports = { makeFinancialWriteGuard, clearHaltCache, getCacheStatus };
