const Controller = require('../controller');

module.exports = (router) => {
    router
        .route('/orders')
        .post(Controller.order.createOrder)
        .get(Controller.order.listOrders)

    router
        .route('/orders/:orderId')
        .get(Controller.order.getOrder)
        .put(Controller.order.updateOrder)
        .delete(Controller.order.deleteOrder)

};
