const Controller = require('../controller');
const { authenticate, canModify } = require('../middleware/auth');
const { auditMiddleware, captureOriginal } = require('../middleware/auditLogger');
const { makeFinancialWriteGuard } = require('../middleware/financialGuard');
const db = require('../models');

// Single guard instance shared across all order routes
const financialWriteGuard = makeFinancialWriteGuard(db);

module.exports = (router) => {
    // Orders - require authentication for all operations
    router
        .route('/orders')
        .post(
            authenticate,           // Must be logged in
            financialWriteGuard,    // Block writes when audit declares HALT
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
            financialWriteGuard,    // Block writes when audit declares HALT
            captureOriginal(db.order, 'orderId'),
            auditMiddleware('ORDER'),
            Controller.order.updateOrder
        )
        .delete(
            authenticate,
            canModify,              // Admin only for deletion
            financialWriteGuard,    // Deletion reverses ledger entries — block during HALT
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

    // Toggle payment status - admin and billing staff can toggle
    router
        .route('/orders/:orderId/payment-status')
        .patch(
            authenticate,
            financialWriteGuard,    // Block writes when audit declares HALT
            captureOriginal(db.order, 'orderId'),
            auditMiddleware('ORDER'),
            Controller.order.togglePaymentStatus
        );

    // Confirm link — admin explicitly links order to existing customer after prompt
    router
        .route('/orders/:orderId/confirm-link')
        .post(
            authenticate,
            canModify,
            Controller.order.confirmLink
        );
};
