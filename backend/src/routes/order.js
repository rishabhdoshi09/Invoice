const Controller = require('../controller');

module.exports = (router) => {
    router
        .route('/orders')
        .post(Controller.order.createOrder)
        .get(Controller.order.listOrders)

    router
        .route('/orders/:orderId')
        .get(Controller.order.getOrder)
        .delete(Controller.order.deleteOrder)

};
