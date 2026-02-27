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
        .route('/audit/weight-captured')
        .post(
            authenticate,
            Controller.billAudit.logWeightCapture
        );

    router
        .route('/audit/weight-consumed')
        .post(
            authenticate,
            Controller.billAudit.markWeightConsumed
        );

    // Telegram alert endpoints (admin only)
    router
        .route('/audit/telegram/test')
        .post(
            authenticate,
            authorize('admin'),
            Controller.billAudit.sendTestAlert
        );

    router
        .route('/audit/telegram/daily-summary')
        .post(
            authenticate,
            authorize('admin'),
            Controller.billAudit.sendDailySummaryNow
        );

    router
        .route('/audit/telegram/full-report')
        .post(
            authenticate,
            authorize('admin'),
            Controller.billAudit.sendFullAuditReport
        );
};
