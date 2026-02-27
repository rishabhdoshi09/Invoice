const Controller = require('../controller');
const { authenticate } = require('../middleware/auth');

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
};
