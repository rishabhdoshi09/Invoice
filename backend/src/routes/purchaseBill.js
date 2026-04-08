const Controller = require('../controller');
const { authenticate, canModify } = require('../middleware/auth');
const { auditMiddleware, captureOriginal } = require('../middleware/auditLogger');
const { makeFinancialWriteGuard } = require('../middleware/financialGuard');
const db = require('../models');

const financialWriteGuard = makeFinancialWriteGuard(db);

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
            captureOriginal(db.purchaseBill, 'purchaseId'),
            auditMiddleware('PURCHASE'),
            Controller.purchaseBill.deletePurchaseBill
        );
};
