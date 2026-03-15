const Controller = require('../controller/dataIntegrityAudit');
const RecoveryController = require('../controller/paymentRecovery');
const ClassifyController = require('../controller/forensicClassification');
const { backupDatabase } = require('../controller/dbBackup');
const { authenticate, authorize } = require('../middleware/auth');

module.exports = (router) => {
    // Forensic Classification: READ-ONLY — classifies every order into 5 categories
    router.get('/data-audit/classify', authenticate, authorize('admin'), ClassifyController.classifyOrders);

    // Classification-based Repair (dry-run + execute)
    router.post('/data-audit/repair/preview', authenticate, authorize('admin'), ClassifyController.repairPreview);
    router.post('/data-audit/repair/execute', authenticate, authorize('admin'), ClassifyController.repairExecute);

    // FIFO Reconstruction: Reset + FIFO allocate + Update (production-grade recovery)
    router.post('/data-audit/reconstruct-fifo', authenticate, authorize('admin'), ClassifyController.reconstructFifo);

    // Forensic Scan: READ-ONLY diagnostic report
    router.get('/data-audit/forensic', authenticate, authorize('admin'), Controller.forensicScan);

    // Fix Selected Orders: user picks which orders to fix
    router.post('/data-audit/fix', authenticate, authorize('admin'), Controller.fixSelectedOrders);

    // Payment Recovery Script (Steps 1-7)
    router.get('/data-audit/recovery/preview', authenticate, authorize('admin'), RecoveryController.recoveryPreview);
    router.post('/data-audit/recovery/execute', authenticate, authorize('admin'), RecoveryController.recoveryExecute);
    router.get('/data-audit/recovery/validate', authenticate, authorize('admin'), RecoveryController.recoveryValidate);

    // Diagnostic: deep scan of DB state — helps debug classification issues
    router.get('/data-audit/diagnose', authenticate, authorize('admin'), ClassifyController.diagnose);

    // Database Backup: download full pg_dump
    router.get('/data-audit/backup', authenticate, authorize('admin'), backupDatabase);

    // Backward compat
    router.get('/data-audit/reconstruct', authenticate, authorize('admin'), Controller.reconstructOrders);
    router.post('/data-audit/reconstruct', authenticate, authorize('admin'), Controller.reconstructOrders);
};
