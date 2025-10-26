const Controller = require('../controller');

module.exports = (router) => {
    router
        .route('/products')
        .post(Controller.product.addProduct)
        .get(Controller.product.listProducts)

    router
        .route('/products/:productId')
        .put(Controller.product.updateProduct)
        .get(Controller.product.getProduct)
        .delete(Controller.product.deleteProduct)

    router
        .route('/weights')
        .get(Controller.product.getWeights)

};
