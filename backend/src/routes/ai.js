const { authenticate } = require('../middleware/auth');
const controller = require('../controller/ai');
const rateLimit = require('express-rate-limit');

// Stricter limit for AI — 30 requests per 10 minutes per IP
const aiLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    message: { status: 429, message: 'Too many AI requests. Please wait a moment.' }
});

module.exports = (router) => {
    router.post('/ai/chat', authenticate, aiLimiter, controller.chat);
};
