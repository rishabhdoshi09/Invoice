const Controller = require('../controller');
const { authenticate, optionalAuth, canModify } = require('../middleware/auth');
const { auditMiddleware, captureOriginal } = require('../middleware/auditLogger');
const db = require('../models');

module.exports = (router) => {
    // Orders - require authentication for all operations
    router
        .route('/orders')
        .post(
            authenticate,           // Must be logged in
            auditMiddleware('ORDER'),
            Controller.order.createOrder
        )
        .get(
            authenticate,           // Must be logged in to view
            Controller.order.listOrders
        );

    router
        .route('/orders/:orderId')
        .get(
            authenticate,
            Controller.order.getOrder
        )
        .put(
            authenticate,
            canModify,              // Admin only for editing
            captureOriginal(db.order, 'orderId'),
            auditMiddleware('ORDER'),
            Controller.order.updateOrder
        )
        .delete(
            authenticate,
            canModify,              // Admin only for deletion
            captureOriginal(db.order, 'orderId'),
            auditMiddleware('ORDER'),
            Controller.order.deleteOrder
        );
};
