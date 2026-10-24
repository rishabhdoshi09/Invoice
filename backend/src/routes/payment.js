const Controller = require('../controller');
const { authenticate, canModify } = require('../middleware/auth');
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
        .delete(
            authenticate,
            canModify,
            financialWriteGuard,    // Deletion reverses ledger entries — block during HALT
            Controller.payment.deletePayment
        );

    router
        .route('/payments/:paymentId/date')
        .patch(
            authenticate,
            canModify,              // admin only, like delete
            financialWriteGuard,    // moves journal dates — block during HALT
            Controller.payment.changePaymentDate
        );

    // Notes are descriptive only (not in the journal), so no HALT guard.
    router
        .route('/payments/:paymentId/notes')
        .patch(
            authenticate,
            canModify,              // admin only, like the other ledger edits
            Controller.payment.changePaymentNotes
        );
};
