const Controller = require('../controller/dataIntegrityAudit');
const RecoveryController = require('../controller/paymentRecovery');
const { authenticate, authorize } = require('../middleware/auth');

module.exports = (router) => {
    // Forensic Scan: READ-ONLY diagnostic report
    router.get('/data-audit/forensic', authenticate, authorize('admin'), Controller.forensicScan);

    // Fix Selected Orders: user picks which orders to fix
    router.post('/data-audit/fix', authenticate, authorize('admin'), Controller.fixSelectedOrders);

    // Payment Recovery Script (Steps 1-7)
    router.get('/data-audit/recovery/preview', authenticate, authorize('admin'), RecoveryController.recoveryPreview);
    router.post('/data-audit/recovery/execute', authenticate, authorize('admin'), RecoveryController.recoveryExecute);
    router.get('/data-audit/recovery/validate', authenticate, authorize('admin'), RecoveryController.recoveryValidate);

    // Backward compat: old reconstruct endpoints
    router.get('/data-audit/reconstruct', authenticate, authorize('admin'), Controller.reconstructOrders);
    router.post('/data-audit/reconstruct', authenticate, authorize('admin'), Controller.reconstructOrders);
};
