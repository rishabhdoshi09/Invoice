const jwt = require('jsonwebtoken');
const db = require('../models');

// SECURITY: JWT_SECRET MUST be set in ENV. A hardcoded fallback would let anyone
// who knows the default string forge admin tokens. Fail fast on startup instead.
if (!process.env.JWT_SECRET) {
    console.error(
        '[SECURITY] FATAL: JWT_SECRET environment variable is not set. ' +
        'The server cannot start without a strong, unique JWT secret. ' +
        'Add JWT_SECRET=<random-256-bit-string> to your .env file and restart.'
    );
    process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

// Generate JWT token.
// HR-JWT: tokenVersion is embedded so we can invalidate ALL tokens for a user
// by incrementing their tokenVersion in the DB (e.g. on password change).
const generateToken = (user) => {
    return jwt.sign(
        {
            id:           user.id,
            username:     user.username,
            name:         user.name,
            role:         user.role,
            tokenVersion: user.tokenVersion || 0
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// Verify JWT token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

// Authentication middleware
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                status: 401,
                message: 'Authentication required. Please login.'
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);

        if (!decoded) {
            return res.status(401).json({
                status: 401,
                message: 'Invalid or expired token. Please login again.'
            });
        }

        // Get fresh user data from database
        const user = await db.user.findOne({
            where: {
                id: decoded.id,
                isDeleted: false,
                isActive: true
            }
        });

        if (!user) {
            return res.status(401).json({
                status: 401,
                message: 'User not found or deactivated.'
            });
        }

        // HR-JWT: Validate tokenVersion. If the user changed their password or was
        // force-logged-out, their tokenVersion was incremented in the DB. Any token
        // issued before that increment carries a lower version and is rejected here,
        // even if the JWT signature and expiry are still valid.
        // Use ?? 0 so pre-migration tokens (no tokenVersion in payload) are treated
        // as version 0. If the user has since changed their password (tokenVersion > 0),
        // the old token is correctly rejected instead of bypassing the check.
        const tokenVer = decoded.tokenVersion ?? 0;
        if (tokenVer !== user.tokenVersion) {
            return res.status(401).json({
                status: 401,
                message: 'Session has been invalidated. Please login again.'
            });
        }

        // Attach user to request
        req.user = {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            email: user.email
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            status: 500,
            message: 'Authentication error'
        });
    }
};

// Role-based authorization middleware
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                status:  401,
                message: 'Authentication required'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            // LR-ROLE: Do NOT disclose the required role or the user's current role
            // in the error response — this assists privilege-escalation reconnaissance.
            return res.status(403).json({
                status:  403,
                message: 'Access denied. You do not have permission to perform this action.'
            });
        }

        next();
    };
};

// Check if user can edit/delete (admin only)
const canModify = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            status:  401,
            message: 'Authentication required'
        });
    }

    if (req.user.role !== 'admin') {
        // LR-ROLE: Do not disclose the user's current role in the error response.
        return res.status(403).json({
            status:  403,
            message: 'Access denied. Administrator privileges are required to edit or delete records.'
        });
    }

    next();
};

// Optional authentication (doesn't fail if no token, but attaches user if present)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const decoded = verifyToken(token);

            if (decoded) {
                const user = await db.user.findOne({
                    where: {
                        id: decoded.id,
                        isDeleted: false,
                        isActive: true
                    }
                });

                    // HR-JWT: same tokenVersion check as authenticate — a revoked
                    // token must not attach user context even on optional-auth routes.
                    const tokenVer = decoded.tokenVersion ?? 0;
                if (user && tokenVer === user.tokenVersion) {
                    req.user = {
                        id: user.id,
                        username: user.username,
                        name: user.name,
                        role: user.role,
                        email: user.email
                    };
                }
            }
        }

        next();
    } catch (error) {
        // Continue without auth
        next();
    }
};

module.exports = {
    generateToken,
    verifyToken,
    authenticate,
    authorize,
    canModify,
    optionalAuth
    // JWT_SECRET intentionally NOT exported — exporting the signing secret
    // would allow any module that imports auth.js to forge tokens.
};
