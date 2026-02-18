const Services = require('../services');
const moment = require('moment-timezone');

module.exports = {
    // Get audit logs with filters
    getAuditLogs: async (req, res) => {
        try {
            const filters = {
                userId: req.query.userId,
                action: req.query.action,
                entityType: req.query.entityType,
                entityId: req.query.entityId,
                startDate: req.query.startDate,
                endDate: req.query.endDate,
                limit: parseInt(req.query.limit) || 100,
                offset: parseInt(req.query.offset) || 0
            };

            const logs = await Services.auditLog.getAuditLogs(filters);
            
            return res.status(200).json({
                status: 200,
                data: logs
            });
        } catch (error) {
            console.error('Get audit logs error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Get history for specific entity
    getEntityHistory: async (req, res) => {
        try {
            const { entityType, entityId } = req.params;
            
            const logs = await Services.auditLog.getEntityHistory(entityType, entityId);
            
            return res.status(200).json({
                status: 200,
                data: logs
            });
        } catch (error) {
            console.error('Get entity history error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Get user activity
    getUserActivity: async (req, res) => {
        try {
            const userId = req.params.userId || req.user.id;
            const days = parseInt(req.query.days) || 7;
            
            const activity = await Services.auditLog.getUserActivity(userId, days);
            
            return res.status(200).json({
                status: 200,
                data: activity
            });
        } catch (error) {
            console.error('Get user activity error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Get recent deletions
    getRecentDeletions: async (req, res) => {
        try {
            const days = parseInt(req.query.days) || 30;
            
            const deletions = await Services.auditLog.getRecentDeletions(days);
            
            return res.status(200).json({
                status: 200,
                data: deletions
            });
        } catch (error) {
            console.error('Get recent deletions error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Get suspicious activity alerts
    getSuspiciousActivity: async (req, res) => {
        try {
            const suspicious = await Services.auditLog.getSuspiciousActivity();
            
            return res.status(200).json({
                status: 200,
                data: suspicious
            });
        } catch (error) {
            console.error('Get suspicious activity error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Dashboard stats
    getDashboardStats: async (req, res) => {
        try {
            const stats = await Services.auditLog.getDashboardStats();
            
            return res.status(200).json({
                status: 200,
                data: stats
            });
        } catch (error) {
            console.error('Get dashboard stats error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Get today's summary
    getTodaySummary: async (req, res) => {
        try {
            const summary = await Services.dailySummary.getTodaySummary();
            
            return res.status(200).json({
                status: 200,
                data: summary
            });
        } catch (error) {
            console.error('Get today summary error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Get summary by date
    getSummaryByDate: async (req, res) => {
        try {
            const { date } = req.params;
            
            const summary = await Services.dailySummary.getSummaryByDate(date);
            
            if (!summary) {
                return res.status(404).json({
                    status: 404,
                    message: 'No summary found for this date'
                });
            }
            
            return res.status(200).json({
                status: 200,
                data: summary
            });
        } catch (error) {
            console.error('Get summary by date error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Get summaries for date range
    getSummariesInRange: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            
            if (!startDate || !endDate) {
                return res.status(400).json({
                    status: 400,
                    message: 'startDate and endDate are required'
                });
            }
            
            const summaries = await Services.dailySummary.getSummariesInRange(startDate, endDate);
            
            return res.status(200).json({
                status: 200,
                data: summaries
            });
        } catch (error) {
            console.error('Get summaries in range error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Close day (admin only)
    closeDay: async (req, res) => {
        try {
            const { date } = req.params;
            const { notes } = req.body;
            
            const summary = await Services.dailySummary.closeDay(date, req.user.id, notes);
            
            return res.status(200).json({
                status: 200,
                message: 'Day closed successfully',
                data: summary
            });
        } catch (error) {
            console.error('Close day error:', error);
            return res.status(400).json({
                status: 400,
                message: error.message
            });
        }
    },

    // Reopen day (admin only)
    reopenDay: async (req, res) => {
        try {
            const { date } = req.params;
            
            const summary = await Services.dailySummary.reopenDay(date, req.user.id);
            
            return res.status(200).json({
                status: 200,
                message: 'Day reopened successfully',
                data: summary
            });
        } catch (error) {
            console.error('Reopen day error:', error);
            return res.status(400).json({
                status: 400,
                message: error.message
            });
        }
    },

    // Recalculate summary (admin utility)
    recalculateSummary: async (req, res) => {
        try {
            const { date } = req.params;
            
            const summary = await Services.dailySummary.recalculateSummary(date);
            
            return res.status(200).json({
                status: 200,
                message: 'Summary recalculated successfully',
                data: summary
            });
        } catch (error) {
            console.error('Recalculate summary error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Get invoice sequence info
    getInvoiceSequence: async (req, res) => {
        try {
            const info = await Services.invoiceSequence.getSequenceInfo();
            
            return res.status(200).json({
                status: 200,
                data: info
            });
        } catch (error) {
            console.error('Get invoice sequence error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Set opening balance for today
    setOpeningBalance: async (req, res) => {
        try {
            const { amount } = req.body;
            
            if (amount === undefined || amount === null) {
                return res.status(400).json({
                    status: 400,
                    message: 'Amount is required'
                });
            }

            const summary = await Services.dailySummary.setOpeningBalance(
                parseFloat(amount),
                req.user?.name || req.user?.username
            );
            
            return res.status(200).json({
                status: 200,
                message: 'Opening balance set successfully',
                data: summary
            });
        } catch (error) {
            console.error('Set opening balance error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Get real-time summary (bypasses cache, calculates from actual orders)
    getRealTimeSummary: async (req, res) => {
        try {
            const { date } = req.params;
            
            const summary = await Services.dailySummary.getRealTimeSummary(date);
            
            return res.status(200).json({
                status: 200,
                data: summary
            });
        } catch (error) {
            console.error('Get real-time summary error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Debug endpoint to check payment date formats in database
    debugPaymentDates: async (req, res) => {
        try {
            const db = require('../models');
            const moment = require('moment-timezone');
            
            const { date } = req.params;
            const dateDDMMYYYY = moment(date).format('DD-MM-YYYY');
            
            // Get all unique payment dates for today to diagnose format issues
            const allPayments = await db.payment.findAll({
                attributes: ['id', 'paymentDate', 'partyType', 'partyName', 'amount'],
                order: [['createdAt', 'DESC']],
                limit: 50
            });
            
            // Check what formats exist
            const dateFormats = allPayments.reduce((acc, p) => {
                const dateStr = p.paymentDate;
                if (!acc[dateStr]) {
                    acc[dateStr] = { count: 0, types: {} };
                }
                acc[dateStr].count++;
                acc[dateStr].types[p.partyType] = (acc[dateStr].types[p.partyType] || 0) + 1;
                return acc;
            }, {});
            
            // Find expenses specifically
            const expenses = allPayments.filter(p => p.partyType === 'expense');
            
            return res.status(200).json({
                status: 200,
                data: {
                    requestedDate: date,
                    formattedDate: dateDDMMYYYY,
                    totalPaymentsFound: allPayments.length,
                    expensesFound: expenses.length,
                    expensesList: expenses.map(e => ({
                        date: e.paymentDate,
                        name: e.partyName,
                        amount: e.amount
                    })),
                    uniqueDatesInDB: dateFormats,
                    hint: 'Check if expense paymentDate matches the formattedDate format'
                }
            });
        } catch (error) {
            console.error('Debug payment dates error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    }
};
