const Controller = require('../controller');

module.exports = (router) => {
    router
        .route('/reports/outstanding-receivables')
        .get(Controller.reports.getOutstandingReceivables);

    router
        .route('/reports/outstanding-payables')
        .get(Controller.reports.getOutstandingPayables);

    router
        .route('/reports/party-statement/:partyType/:partyId')
        .get(Controller.reports.getPartyStatement);
};
