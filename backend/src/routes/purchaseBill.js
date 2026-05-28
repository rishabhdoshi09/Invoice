const Controller = require('../controller');
const { authenticate, canModify } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLogger');
const { makeFinancialWriteGuard } = require('../middleware/financialGuard');

const financialWriteGuard = makeFinancialWriteGuard(require('../models'));

module.exports = (router) => {
    router
        .route('/purchases')
        .post(
            authenticate,
            financialWriteGuard,    // Block writes when audit declares HALT
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
            financialWriteGuard,    // Deletion reverses ledger entries — block during HALT
            Controller.purchaseBill.deletePurchaseBill
        );
};
