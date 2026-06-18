const Controller = require('../controller');
const { authenticate, canModify, authorize } = require('../middleware/auth');
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

    // Get all supplier name change logs
    router.get('/suppliers/logs/name-changes', authenticate, authorize('admin'), async (req, res) => {
        try {
            const logs = await db.sequelize.query(`
                SELECT
                    al."entityId" as "supplierId",
                    al."entityName" as "newName",
                    al."oldValues"->>'name' as "oldName",
                    COALESCE(al."newValues"->>'name', al."entityName") as "currentName",
                    al."userName",
                    al."userRole",
                    al."createdAt"
                FROM audit_logs al
                WHERE al."entityType" = 'SUPPLIER_NAME_CHANGE'
                  OR (
                    al."entityType" = 'SUPPLIER'
                    AND al."action" = 'UPDATE'
                    AND al."oldValues"->>'name' IS NOT NULL
                    AND al."newValues"->>'name' IS NOT NULL
                    AND al."oldValues"->>'name' != al."newValues"->>'name'
                  )
                ORDER BY al."createdAt" DESC
                LIMIT 500
            `, { type: db.Sequelize.QueryTypes.SELECT });
            res.json({ status: 200, data: logs });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    });
};
