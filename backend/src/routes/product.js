const Controller = require('../controller');
const { authenticate, canModify } = require('../middleware/auth');
const { auditMiddleware, captureOriginal } = require('../middleware/auditLogger');
const db = require('../models');

module.exports = (router) => {
    router
        .route('/products')
        .post(
            authenticate,
            auditMiddleware('PRODUCT'),
            Controller.product.addProduct
        )
        .get(
            authenticate,
            Controller.product.listProducts
        );

    router
        .route('/products/:productId')
        .get(
            authenticate,
            Controller.product.getProduct
        )
        .put(
            authenticate,
            canModify,
            captureOriginal(db.product, 'productId'),
            auditMiddleware('PRODUCT'),
            Controller.product.updateProduct
        )
        .delete(
            authenticate,
            canModify,
            captureOriginal(db.product, 'productId'),
            auditMiddleware('PRODUCT'),
            Controller.product.deleteProduct
        );

    // Weights endpoint for weighing scale
    router
        .route('/weights')
        .get(
            authenticate,
            Controller.product.getWeights
        );
};
