const Controller = require('../controller');
const { authenticate, authorize } = require('../middleware/auth');

module.exports = (router) => {
    // All export routes require admin access
    router
        .route('/export/tally/sales')
        .get(authenticate, authorize('admin'), Controller.tallyExport.exportSales)
        .post(authenticate, authorize('admin'), Controller.tallyExport.exportSelectedSales);

    router
        .route('/export/tally/purchases')
        .get(authenticate, authorize('admin'), Controller.tallyExport.exportPurchases)
        .post(authenticate, authorize('admin'), Controller.tallyExport.exportSelectedPurchases);

    router
        .route('/export/tally/payments')
        .get(authenticate, authorize('admin'), Controller.tallyExport.exportPayments);

    router
        .route('/export/tally/outstanding')
        .get(authenticate, authorize('admin'), Controller.tallyExport.exportOutstanding);
};
