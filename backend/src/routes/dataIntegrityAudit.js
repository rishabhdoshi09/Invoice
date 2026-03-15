const Controller = require('../controller/dataIntegrityAudit');
const { authenticate, authorize } = require('../middleware/auth');

module.exports = (router) => {
    // Audit: Scan orders for payment data mismatches (READ-ONLY)
    router.get('/data-audit/orders', authenticate, authorize('admin'), Controller.auditOrders);

    // Fix: Correct selected orders' payment data (requires changedBy)
    router.post('/data-audit/orders/fix', authenticate, authorize('admin'), Controller.fixOrders);

    // Undo: Restore orders wrongly changed by the fix back to paid
    router.post('/data-audit/orders/undo-fix', authenticate, authorize('admin'), Controller.undoLastFix);
};
