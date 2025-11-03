const Controller = require('../controller');

module.exports = (router) => {
    router
        .route('/export/tally/sales')
        .get(Controller.tallyExport.exportSales)
        .post(Controller.tallyExport.exportSelectedSales);

    router
        .route('/export/tally/purchases')
        .get(Controller.tallyExport.exportPurchases)
        .post(Controller.tallyExport.exportSelectedPurchases);

    router
        .route('/export/tally/payments')
        .get(Controller.tallyExport.exportPayments);

    router
        .route('/export/tally/outstanding')
        .get(Controller.tallyExport.exportOutstanding);
};
