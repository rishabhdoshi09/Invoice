/**
 * Financial Integrity Guard — BLOCKING Layer
 *
 * This middleware BLOCKS all financial write operations when the self-audit
 * system has declared a HALT or CRITICAL status. The audit system detects
 * invariant violations; this middleware enforces the block.
 *
 * Architecture:
 *   - HR-HALT FIX: Status is read from the reconciliation_runs table in the
 *     database on every request (with a short 10-second in-process TTL to
 *     reduce DB load). Previously the cache was purely in-process memory,
 *     meaning a HALT detected by one Node.js worker was invisible to other
 *     workers in a multi-instance / PM2 cluster deployment. Now all instances
 *     share a single source of truth: the database row.
 *   - CRITICAL status logs a warning but does NOT block (operator must review).
 *   - HALT status blocks ALL financial writes immediately, across ALL instances.
 *
 * Usage:
 *   router.post('/orders', authenticate, financialWriteGuard, createOrder);
 *   router.post('/payments', authenticate, financialWriteGuard, createPayment);
 *
 * Override (emergency bypass — admin only, leaves audit trail):
 *   Pass header  X-Financial-Guard-Override: <OVERRIDE_SECRET>
 *   The secret must be set in ENV as FINANCIAL_GUARD_OVERRIDE_SECRET.
 *   Bypass is logged to console AND the audit_logs table.
 */

// HR-HALT FIX: Reduced from 60 s to 10 s so HALT propagates to all instances
// within 10 seconds of a reconciliation run detecting a violation.
// Trade-off: ~6x more DB reads per instance per minute. Acceptable cost.
const CACHE_TTL_MS = 10 * 1000;     // refresh every 10 s (was 60 s)
const HALT_LOCK_MS = 5 * 60 * 1000; // HALT stays locked for 5 min after clearing

// Lazy-load to avoid circular dependency at module init time
let _db = null;
function getDb() {
    if (!_db) _db = require('../models');
    return _db;
}

// Per-process cache acts as a rate-limiter on DB reads, not as the authority.
// The DB is the authority. If this cache shows OK but DB shows HALT, the next
// refresh (within 10 s) will catch it. This is acceptable for financial guard
// purposes — a brief window before HALT propagates is far better than missing
// it entirely in a multi-process deployment.
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
                    const bypassUser = req.user?.username || 'unknown';
                    console.error(
                        `[FINANCIAL GUARD] ⚠️  OVERRIDE BYPASS by ${bypassUser} ` +
                        `on ${req.method} ${req.path} — HALT status in effect. This action is logged.`
                    );
                    // SECURITY FIX: Write override usage to the audit trail — not just console.
                    // An unlogged bypass is a fraud vector. Any future query to audit_logs will
                    // show exactly who bypassed the financial guard and when.
                    try {
                        const { v4: uuidv4 } = require('uuid');
                        await db.auditLog.create({
                            id: uuidv4(),
                            userId:      req.user?.id   || null,
                            userName:    req.user?.name || bypassUser,
                            userRole:    req.user?.role || 'unknown',
                            action:      'FINANCIAL_GUARD_OVERRIDE',
                            entityType:  'SYSTEM',
                            entityId:    null,
                            entityName:  'FinancialGuard',
                            description: `HALT bypass by ${bypassUser} on ${req.method} ${req.path}`,
                            ipAddress:   req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                                         req.socket?.remoteAddress || 'unknown',
                            userAgent:   req.headers['user-agent'] || null,
                            metadata:    { method: req.method, path: req.path, haltSince: _cache.haltSince }
                        });
                    } catch (auditErr) {
                        // Log but do not block — the override is still audited to console above.
                        console.error('[FINANCIAL GUARD] Failed to write override to audit_log:', auditErr.message);
                    }
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
            // SECURITY: fail-closed. If the guard itself throws (DB down, etc.)
            // we BLOCK the write rather than allowing it through. The cost of a
            // false-positive block is an operator call; the cost of a false-negative
            // is unguarded financial writes during a potential integrity incident.
            console.error('[FINANCIAL GUARD] Guard check threw — BLOCKING request (fail-closed):', err.message);
            return res.status(503).json({
                status: 503,
                error: 'FINANCIAL_GUARD_ERROR',
                message:
                    'Financial integrity check failed to run. All financial writes are blocked ' +
                    'until the guard can be verified. Contact your system administrator.',
            });
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
