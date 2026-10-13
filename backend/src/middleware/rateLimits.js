'use strict';

const rateLimit = require('express-rate-limit');

// Strict limit on authentication endpoints to block brute-force and credential
// stuffing attacks. 10 attempts per 15 minutes per IP.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, message: 'Too many login attempts. Please try again after 15 minutes.' }
});

// Broad API rate limit — 300 requests per minute per IP to prevent DoS.
//
// The scale's weight endpoint is exempt. A single '/' press polls it several
// times while the item settles, and during USB drop-outs the operator presses
// repeatedly. Counted here, that polling used up the shared budget and the
// next request to SAVE THE BILL failed with 429. It only reads an in-memory
// value, so exempting it carries no real DoS risk.
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,        // 1 minute
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'GET' && req.path === '/weights',
    message: { status: 429, message: 'Too many requests. Please slow down.' }
});

module.exports = { authLimiter, apiLimiter };
