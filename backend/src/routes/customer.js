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

    // Get customers with debit/credit/balance
    router
        .route('/customers/with-balance')
        .get(
            authenticate,
            Controller.customer.listCustomersWithBalance
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

    // Get customer with full transaction history
    router
        .route('/customers/:customerId/transactions')
        .get(
            authenticate,
            Controller.customer.getCustomerWithTransactions
        );
};
