const Controller = require('../controller');

module.exports = (router) => {
    router
        .route('/customers')
        .post(Controller.customer.createCustomer)
        .get(Controller.customer.listCustomers)

    router
        .route('/customers/:customerId')
        .get(Controller.customer.getCustomer)
        .put(Controller.customer.updateCustomer)
        .delete(Controller.customer.deleteCustomer)
};

