const Controller = require('../controller');
const { authenticate } = require('../middleware/auth');

module.exports = (router) => {
    router
        .route('/reports/outstanding-receivables')
        .get(authenticate, Controller.reports.getOutstandingReceivables);

    router
        .route('/reports/outstanding-payables')
        .get(authenticate, Controller.reports.getOutstandingPayables);

    router
        .route('/reports/party-statement/:partyType/:partyId')
        .get(authenticate, Controller.reports.getPartyStatement);
};
