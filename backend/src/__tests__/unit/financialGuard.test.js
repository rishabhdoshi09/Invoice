/**
 * Unit tests for the Financial Integrity Guard middleware.
 *
 * Tests the core guard behaviors without a database connection —
 * the DB is injected via the factory function and mocked here.
 *
 * Run: npm test -- --testPathPattern=financialGuard
 */

const { makeFinancialWriteGuard, clearHaltCache, getCacheStatus } = require('../../middleware/financialGuard');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a mock db whose sequelize.query returns the given status string.
 */
function makeMockDb(status) {
    return {
        sequelize: {
            query: jest.fn().mockResolvedValue([[{ overallStatus: status }]]),
        },
        auditLog: {
            create: jest.fn().mockResolvedValue({}),
        },
    };
}

/**
 * Build a mock db that throws on query (simulates DB outage).
 */
function makeFailingDb() {
    return {
        sequelize: {
            query: jest.fn().mockRejectedValue(new Error('Connection refused')),
        },
        auditLog: {
            create: jest.fn(),
        },
    };
}

function makeReqRes() {
    const req = {
        method: 'POST',
        path: '/orders',
        headers: {},
        user: { id: 'u1', username: 'admin', name: 'Admin', role: 'admin' },
        socket: { remoteAddress: '127.0.0.1' },
    };
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
    };
    const next = jest.fn();
    return { req, res, next };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
    clearHaltCache();
    delete process.env.FINANCIAL_GUARD_OVERRIDE_SECRET;
});

describe('Financial Guard — normal operation', () => {
    it('calls next() when status is OK', async () => {
        const guard = makeFinancialWriteGuard(makeMockDb('OK'));
        const { req, res, next } = makeReqRes();
        await guard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    it('calls next() when status is WARNING', async () => {
        const guard = makeFinancialWriteGuard(makeMockDb('WARNING'));
        const { req, res, next } = makeReqRes();
        await guard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('calls next() and sets X-Audit-Status header when status is CRITICAL', async () => {
        const guard = makeFinancialWriteGuard(makeMockDb('CRITICAL'));
        const { req, res, next } = makeReqRes();
        await guard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.setHeader).toHaveBeenCalledWith('X-Audit-Status', 'CRITICAL');
    });

    it('calls next() when no reconciliation runs exist (UNKNOWN status)', async () => {
        const db = { sequelize: { query: jest.fn().mockResolvedValue([[]]) }, auditLog: { create: jest.fn() } };
        const guard = makeFinancialWriteGuard(db);
        const { req, res, next } = makeReqRes();
        await guard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});

describe('Financial Guard — HALT state', () => {
    it('returns 503 FINANCIAL_INTEGRITY_HALT when status is HALT', async () => {
        const guard = makeFinancialWriteGuard(makeMockDb('HALT'));
        const { req, res, next } = makeReqRes();
        await guard(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'FINANCIAL_INTEGRITY_HALT' })
        );
    });

    it('response body includes haltActiveSince timestamp', async () => {
        const guard = makeFinancialWriteGuard(makeMockDb('HALT'));
        const { req, res, next } = makeReqRes();
        await guard(req, res, next);
        const body = res.json.mock.calls[0][0];
        expect(body).toHaveProperty('haltActiveSince');
    });
});

describe('Financial Guard — emergency override', () => {
    it('allows bypass when HALT and correct override secret is provided', async () => {
        process.env.FINANCIAL_GUARD_OVERRIDE_SECRET = 'super-secret-override';
        const db = makeMockDb('HALT');
        const guard = makeFinancialWriteGuard(db);
        const { req, res, next } = makeReqRes();
        req.headers['x-financial-guard-override'] = 'super-secret-override';

        await guard(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        // Override usage must be written to audit log
        expect(db.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'FINANCIAL_GUARD_OVERRIDE' })
        );
    });

    it('still blocks when HALT and wrong override secret is provided', async () => {
        process.env.FINANCIAL_GUARD_OVERRIDE_SECRET = 'correct-secret';
        const guard = makeFinancialWriteGuard(makeMockDb('HALT'));
        const { req, res, next } = makeReqRes();
        req.headers['x-financial-guard-override'] = 'wrong-secret';

        await guard(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(503);
    });

    it('still blocks when HALT and override env is not configured', async () => {
        // FINANCIAL_GUARD_OVERRIDE_SECRET not set — override is disabled
        const guard = makeFinancialWriteGuard(makeMockDb('HALT'));
        const { req, res, next } = makeReqRes();
        req.headers['x-financial-guard-override'] = 'any-value';

        await guard(req, res, next);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('Financial Guard — DB error degradation', () => {
    it('allows through (UNKNOWN) when DB query throws — table may not exist yet on first boot', async () => {
        // _fetchLatestStatus catches its own DB errors and returns 'UNKNOWN' rather than
        // throwing. This allows the app to start before the first migration run.
        // UNKNOWN status does not block writes.
        const guard = makeFinancialWriteGuard(makeFailingDb());
        const { req, res, next } = makeReqRes();
        await guard(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });
});

describe('clearHaltCache', () => {
    it('resets the cache so the next request re-fetches from DB', async () => {
        // Prime cache with HALT
        const haltDb = makeMockDb('HALT');
        const guard = makeFinancialWriteGuard(haltDb);
        await guard(...Object.values(makeReqRes()));

        // Clear cache and replace with OK
        clearHaltCache();
        const okDb = makeMockDb('OK');
        const guard2 = makeFinancialWriteGuard(okDb);
        const { req, res, next } = makeReqRes();
        await guard2(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
    });
});
