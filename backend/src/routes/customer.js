const Controller = require('../controller');
const { authenticate, canModify } = require('../middleware/auth');
const { auditMiddleware, captureOriginal } = require('../middleware/auditLogger');
const db = require('../models');

module.exports = (router) => {
    router
        .route('/customers')
        .post(
            authenticate,
            auditMiddleware('CUSTOMER'),
            Controller.customer.createCustomer
        )
        .get(
            authenticate,
            Controller.customer.listCustomers
        );

    router
        .route('/customers/:customerId')
        .get(
            authenticate,
            Controller.customer.getCustomer
        )
        .put(
            authenticate,
            canModify,
            captureOriginal(db.customer, 'customerId'),
            auditMiddleware('CUSTOMER'),
            Controller.customer.updateCustomer
        )
        .delete(
            authenticate,
            canModify,
            captureOriginal(db.customer, 'customerId'),
            auditMiddleware('CUSTOMER'),
            Controller.customer.deleteCustomer
        );
};
