const Controller = require('../controller');
const { authenticate, canModify } = require('../middleware/auth');
const { auditMiddleware, captureOriginal } = require('../middleware/auditLogger');
const db = require('../models');

module.exports = (router) => {
    router
        .route('/purchases')
        .post(
            authenticate,
            auditMiddleware('PURCHASE'),
            Controller.purchaseBill.createPurchaseBill
        )
        .get(
            authenticate,
            Controller.purchaseBill.listPurchaseBills
        );

    router
        .route('/purchases/:purchaseId')
        .get(
            authenticate,
            Controller.purchaseBill.getPurchaseBill
        )
        .delete(
            authenticate,
            canModify,
            captureOriginal(db.purchaseBill, 'purchaseId'),
            auditMiddleware('PURCHASE'),
            Controller.purchaseBill.deletePurchaseBill
        );
};
