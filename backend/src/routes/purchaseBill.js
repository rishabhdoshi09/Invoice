const Controller = require('../controller');

module.exports = (router) => {
    router
        .route('/purchases')
        .post(Controller.purchaseBill.createPurchaseBill)
        .get(Controller.purchaseBill.listPurchaseBills)

    router
        .route('/purchases/:purchaseId')
        .get(Controller.purchaseBill.getPurchaseBill)
        .delete(Controller.purchaseBill.deletePurchaseBill)
};
