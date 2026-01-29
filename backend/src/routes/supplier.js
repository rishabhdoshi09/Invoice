const Controller = require('../controller');
const { authenticate, canModify } = require('../middleware/auth');
const { auditMiddleware, captureOriginal } = require('../middleware/auditLogger');
const db = require('../models');

module.exports = (router) => {
    router
        .route('/suppliers')
        .post(
            authenticate,
            auditMiddleware('SUPPLIER'),
            Controller.supplier.createSupplier
        )
        .get(
            authenticate,
            Controller.supplier.listSuppliers
        );

    // Get suppliers with debit/credit/balance
    router
        .route('/suppliers/with-balance')
        .get(
            authenticate,
            Controller.supplier.listSuppliersWithBalance
        );

    router
        .route('/suppliers/:supplierId')
        .get(
            authenticate,
            Controller.supplier.getSupplier
        )
        .put(
            authenticate,
            canModify,
            captureOriginal(db.supplier, 'supplierId'),
            auditMiddleware('SUPPLIER'),
            Controller.supplier.updateSupplier
        )
        .delete(
            authenticate,
            canModify,
            captureOriginal(db.supplier, 'supplierId'),
            auditMiddleware('SUPPLIER'),
            Controller.supplier.deleteSupplier
        );

    // Get supplier with full transaction history
    router
        .route('/suppliers/:supplierId/transactions')
        .get(
            authenticate,
            Controller.supplier.getSupplierWithTransactions
        );
};
