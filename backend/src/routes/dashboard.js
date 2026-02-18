const Controller = require('../controller/dashboard');
const { authenticate, authorize } = require('../middleware/auth');

module.exports = (router) => {
    // All dashboard routes require authentication
    
    // Audit logs (admin only)
    router.get('/dashboard/audit-logs', authenticate, authorize('admin'), Controller.getAuditLogs);
    router.get('/dashboard/audit-logs/entity/:entityType/:entityId', authenticate, authorize('admin'), Controller.getEntityHistory);
    router.get('/dashboard/audit-logs/user/:userId', authenticate, authorize('admin'), Controller.getUserActivity);
    router.get('/dashboard/audit-logs/deletions', authenticate, authorize('admin'), Controller.getRecentDeletions);
    router.get('/dashboard/audit-logs/suspicious', authenticate, authorize('admin'), Controller.getSuspiciousActivity);
    
    // Dashboard stats (admin only)
    router.get('/dashboard/stats', authenticate, authorize('admin'), Controller.getDashboardStats);
    
    // Daily summaries (both roles can view, but only admin can modify)
    router.get('/dashboard/summary/today', authenticate, Controller.getTodaySummary);
    router.get('/dashboard/summary/date/:date', authenticate, Controller.getSummaryByDate);
    router.get('/dashboard/summary/range', authenticate, Controller.getSummariesInRange);
    
    // Real-time summary - calculated directly from orders (bypasses cache)
    router.get('/dashboard/summary/realtime/:date', authenticate, Controller.getRealTimeSummary);
    
    // Admin only - day management
    router.post('/dashboard/summary/close/:date', authenticate, authorize('admin'), Controller.closeDay);
    router.post('/dashboard/summary/reopen/:date', authenticate, authorize('admin'), Controller.reopenDay);
    router.post('/dashboard/summary/recalculate/:date', authenticate, authorize('admin'), Controller.recalculateSummary);
    
    // Opening balance - accessible by both admin and billing_staff
    router.post('/dashboard/summary/opening-balance', authenticate, authorize('admin', 'billing_staff'), Controller.setOpeningBalance);
    
    // Invoice sequence info
    router.get('/dashboard/invoice-sequence', authenticate, Controller.getInvoiceSequence);
};
