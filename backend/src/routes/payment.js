const Controller = require('../controller');
const { authenticate, canModify } = require('../middleware/auth');
const { auditMiddleware, captureOriginal } = require('../middleware/auditLogger');
const { makeFinancialWriteGuard } = require('../middleware/financialGuard');
const db = require('../models');

// Single guard instance shared across all payment routes
const financialWriteGuard = makeFinancialWriteGuard(db);

module.exports = (router) => {
    router
        .route('/payments')
        .post(
            authenticate,
            financialWriteGuard,    // Block writes when audit declares HALT
            auditMiddleware('PAYMENT'),
            Controller.payment.createPayment
        )
        .get(
            authenticate,
            Controller.payment.listPayments
        );

    router
        .route('/payments/daily-summary')
        .get(
            authenticate,
            Controller.payment.getDailySummary
        );

    router
        .route('/payments/:paymentId')
        .get(
            authenticate,
            Controller.payment.getPayment
        )
        .put(
            authenticate,
            canModify,
            financialWriteGuard,
            Controller.payment.updatePayment
        )
        .delete(
            authenticate,
            canModify,
            captureOriginal(db.payment, 'paymentId'),
            auditMiddleware('PAYMENT'),
            Controller.payment.deletePayment
        );
};
