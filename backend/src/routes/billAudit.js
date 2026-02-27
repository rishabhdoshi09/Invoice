const Controller = require('../controller');
const { authenticate, authorize } = require('../middleware/auth');

module.exports = (router) => {
    router
        .route('/audit/item-deleted')
        .post(
            authenticate,
            Controller.billAudit.logItemRemoved
        );

    router
        .route('/audit/bill-cleared')
        .post(
            authenticate,
            Controller.billAudit.logBillCleared
        );

    router
        .route('/audit/tampering-logs')
        .get(
            authenticate,
            Controller.billAudit.getTamperingLogs
        );

    // Weight audit endpoints
    router
        .route('/audit/weight-logs')
        .get(
            authenticate,
            Controller.billAudit.getWeightLogs
        );

    router
        .route('/audit/weight-consumed')
        .post(
            authenticate,
            Controller.billAudit.markWeightConsumed
        );
};
