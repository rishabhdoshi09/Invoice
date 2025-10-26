const Controller = require('../controller');

module.exports = (router) => {
    router
        .route('/export/tally/sales')
        .get(Controller.tallyExport.exportSales);

    router
        .route('/export/tally/purchases')
        .get(Controller.tallyExport.exportPurchases);

    router
        .route('/export/tally/payments')
        .get(Controller.tallyExport.exportPayments);

    router
        .route('/export/tally/outstanding')
        .get(Controller.tallyExport.exportOutstanding);
};
