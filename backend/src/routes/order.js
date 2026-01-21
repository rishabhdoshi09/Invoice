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

    // Staff notes - accessible by both admin and billing_staff
    router
        .route('/orders/:orderId/notes')
        .post(
            authenticate,           // Any authenticated user can add notes
            Controller.order.addStaffNote
        );

    // Toggle payment status (admin only)
    router
        .route('/orders/:orderId/toggle-payment')
        .post(
            authenticate,
            canModify,              // Admin only
            captureOriginal(db.order, 'orderId'),
            auditMiddleware('ORDER'),
            Controller.order.togglePaymentStatus
        );
};
