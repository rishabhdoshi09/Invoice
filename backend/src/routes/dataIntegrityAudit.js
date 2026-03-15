const Controller = require('../controller/dataIntegrityAudit');
const { authenticate, authorize } = require('../middleware/auth');

module.exports = (router) => {
    // Preview: Show what reconstruction would change (READ-ONLY)
    router.get('/data-audit/reconstruct', authenticate, authorize('admin'), Controller.reconstructOrders);

    // Apply: Reconstruct order states from evidence (requires changedBy)
    router.post('/data-audit/reconstruct', authenticate, authorize('admin'), Controller.reconstructOrders);
};
