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
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role
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
                status: 401,
                message: 'Authentication required'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                status: 403,
                message: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.user.role}`
            });
        }

        next();
    };
};

// Check if user can edit/delete (admin only)
const canModify = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            status: 401,
            message: 'Authentication required'
        });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({
            status: 403,
            message: 'Only administrators can edit or delete records. Your role: ' + req.user.role
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

                if (user) {
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
