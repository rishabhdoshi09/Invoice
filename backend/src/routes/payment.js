const Controller = require('../controller');

module.exports = (router) => {
    router
        .route('/payments')
        .post(Controller.payment.createPayment)
        .get(Controller.payment.listPayments)

    router
        .route('/payments/:paymentId')
        .get(Controller.payment.getPayment)
        .delete(Controller.payment.deletePayment)
};
