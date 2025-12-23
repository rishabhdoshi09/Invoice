const Controller = require('../controller');
const { authenticate, canModify } = require('../middleware/auth');
const { auditMiddleware, captureOriginal } = require('../middleware/auditLogger');
const db = require('../models');

module.exports = (router) => {
    router
        .route('/payments')
        .post(
            authenticate,
            auditMiddleware('PAYMENT'),
            Controller.payment.createPayment
        )
        .get(
            authenticate,
            Controller.payment.listPayments
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
            captureOriginal(db.payment, 'paymentId'),
            auditMiddleware('PAYMENT'),
            Controller.payment.deletePayment
        );
};
