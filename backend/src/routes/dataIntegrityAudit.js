const Controller = require('../controller/dataIntegrityAudit');
const { authenticate, authorize } = require('../middleware/auth');

module.exports = (router) => {
    // Forensic Scan: READ-ONLY diagnostic report
    router.get('/data-audit/forensic', authenticate, authorize('admin'), Controller.forensicScan);

    // Fix Selected Orders: user picks which orders to fix
    router.post('/data-audit/fix', authenticate, authorize('admin'), Controller.fixSelectedOrders);

    // Backward compat: old reconstruct endpoints
    router.get('/data-audit/reconstruct', authenticate, authorize('admin'), Controller.reconstructOrders);
    router.post('/data-audit/reconstruct', authenticate, authorize('admin'), Controller.reconstructOrders);
};
