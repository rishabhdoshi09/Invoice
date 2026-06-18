/**
 * Unit tests for auth middleware.
 *
 * These tests run without a database connection — the database calls
 * inside `authenticate` and `optionalAuth` are mocked via jest.mock.
 *
 * Run: npm test -- --testPathPattern=auth.middleware
 */

// Set env before any require so auth.js does not call process.exit(1)
process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-characters-long-ok';
process.env.JWT_EXPIRES_IN = '1h';

// Mock the db models so authenticate() does not need a real DB
jest.mock('../../models', () => ({
    user: {
        findOne: jest.fn(),
    },
}));

const db = require('../../models');
const { generateToken, verifyToken, authorize, canModify, authenticate } = require('../../middleware/auth');
const jwt = require('jsonwebtoken');

// ─── verifyToken ──────────────────────────────────────────────────────────────
describe('verifyToken', () => {
    it('returns decoded payload for a valid token', () => {
        const user = { id: '1', username: 'admin', name: 'Admin User', role: 'admin', tokenVersion: 0 };
        const token = generateToken(user);
        const decoded = verifyToken(token);
        expect(decoded).toMatchObject({ id: '1', username: 'admin', role: 'admin', tokenVersion: 0 });
    });

    it('returns null for a malformed token', () => {
        expect(verifyToken('not.a.real.token')).toBeNull();
    });

    it('returns null for a token signed with a different secret', () => {
        const badToken = jwt.sign({ id: '1' }, 'completely-different-secret');
        expect(verifyToken(badToken)).toBeNull();
    });

    it('returns null for an expired token', () => {
        const expiredToken = jwt.sign(
            { id: '1', username: 'admin', role: 'admin', tokenVersion: 0 },
            process.env.JWT_SECRET,
            { expiresIn: '-1s' }   // already expired
        );
        expect(verifyToken(expiredToken)).toBeNull();
    });
});

// ─── authorize middleware ──────────────────────────────────────────────────────
describe('authorize middleware', () => {
    const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

    it('calls next() when user has the required role', () => {
        const req = { user: { role: 'admin' } };
        const next = jest.fn();
        authorize('admin')(req, makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('calls next() when user has one of multiple allowed roles', () => {
        const req = { user: { role: 'billing_staff' } };
        const next = jest.fn();
        authorize('admin', 'billing_staff')(req, makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 403 when user role is not in allowed list', () => {
        const req = { user: { role: 'billing_staff' } };
        const res = makeRes();
        const next = jest.fn();
        authorize('admin')(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
        // Must NOT leak the required role (reconnaissance prevention)
        expect(res.json.mock.calls[0][0].message).not.toContain('admin');
    });

    it('returns 401 when no user is attached to request', () => {
        const req = {};
        const res = makeRes();
        authorize('admin')(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });
});

// ─── canModify middleware ──────────────────────────────────────────────────────
describe('canModify middleware', () => {
    const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

    it('calls next() for admin users', () => {
        const next = jest.fn();
        canModify({ user: { role: 'admin' } }, makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 403 for billing_staff', () => {
        const res = makeRes();
        canModify({ user: { role: 'billing_staff' } }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 401 when no user attached', () => {
        const res = makeRes();
        canModify({}, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });
});

// ─── authenticate middleware ───────────────────────────────────────────────────
describe('authenticate middleware', () => {
    const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 401 when no Authorization header is present', async () => {
        const res = makeRes();
        await authenticate({ headers: {} }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when Authorization header is malformed', async () => {
        const res = makeRes();
        await authenticate({ headers: { authorization: 'NotBearer token' } }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 for an invalid/expired token', async () => {
        const res = makeRes();
        await authenticate({ headers: { authorization: 'Bearer invalid.token.here' } }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('attaches user to request and calls next() for valid token + matching tokenVersion', async () => {
        const dbUser = { id: 'u1', username: 'alice', name: 'Alice', role: 'admin', email: 'a@b.com', tokenVersion: 1 };
        db.user.findOne.mockResolvedValueOnce(dbUser);

        const token = generateToken({ ...dbUser });
        // Token carries tokenVersion: 1
        const req = { headers: { authorization: `Bearer ${token}` } };
        const next = jest.fn();
        await authenticate(req, makeRes(), next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toMatchObject({ id: 'u1', role: 'admin' });
    });

    it('returns 401 when tokenVersion in DB is ahead of token (invalidated session)', async () => {
        // User changed password — tokenVersion bumped to 2 in DB
        const dbUser = { id: 'u1', username: 'alice', name: 'Alice', role: 'admin', email: 'a@b.com', tokenVersion: 2 };
        db.user.findOne.mockResolvedValueOnce(dbUser);

        // Token was issued when tokenVersion was 1
        const oldToken = generateToken({ id: 'u1', username: 'alice', name: 'Alice', role: 'admin', tokenVersion: 1 });
        const res = makeRes();
        await authenticate({ headers: { authorization: `Bearer ${oldToken}` } }, res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json.mock.calls[0][0].message).toMatch(/invalidated/i);
    });

    it('returns 401 for pre-migration token (no tokenVersion) when DB tokenVersion > 0', async () => {
        // Pre-migration token has no tokenVersion field in payload
        const dbUser = { id: 'u1', username: 'alice', name: 'Alice', role: 'admin', email: 'a@b.com', tokenVersion: 1 };
        db.user.findOne.mockResolvedValueOnce(dbUser);

        const legacyToken = jwt.sign(
            { id: 'u1', username: 'alice', name: 'Alice', role: 'admin' }, // no tokenVersion
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        const res = makeRes();
        await authenticate({ headers: { authorization: `Bearer ${legacyToken}` } }, res, jest.fn());

        // ?? 0 means the legacy token is treated as version 0, which ≠ DB version 1 → rejected
        expect(res.status).toHaveBeenCalledWith(401);
    });
});
