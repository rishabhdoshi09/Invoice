const db = require('../models');
const uuidv4 = require('uuid/v4');
const moment = require('moment-timezone');
const { Op } = require('sequelize');

module.exports = {
    // Get or create today's summary
    getTodaySummary: async () => {
        const today = moment().format('YYYY-MM-DD');
        const todayDDMMYYYY = moment().format('DD-MM-YYYY');
        
        let summary = await db.dailySummary.findOne({
            where: { date: today }
        });
        
        if (!summary) {
            summary = await db.dailySummary.create({
                id: uuidv4(),
                date: today,
                openingBalance: 0,
                totalSales: 0,
                totalOrders: 0,
                totalPurchases: 0,
                totalPaymentsReceived: 0,
                totalPaymentsMade: 0,
                lastInvoiceNumber: 0,
                orderIds: []
            });
        }
        
        // Calculate today's receivables (credit sales - unpaid orders from today)
        const todayOrders = await db.order.findAll({
            where: {
                orderDate: todayDDMMYYYY,
                paymentStatus: { [Op.in]: ['unpaid', 'partial'] }
            }
        });
        
        const totalReceivables = todayOrders.reduce((sum, order) => {
            return sum + (Number(order.dueAmount) || 0);
        }, 0);
        
        // Return summary with calculated receivables
        return {
            ...summary.toJSON(),
            totalReceivables
        };
    },

    // Set opening balance for today
    setOpeningBalance: async (amount, setBy) => {
        const today = moment().format('YYYY-MM-DD');
        
        let summary = await db.dailySummary.findOne({
            where: { date: today }
        });
        
        if (!summary) {
            summary = await db.dailySummary.create({
                id: uuidv4(),
                date: today,
                openingBalance: amount,
                openingBalanceSetAt: new Date(),
                openingBalanceSetBy: setBy,
                totalSales: 0,
                totalOrders: 0,
                totalPurchases: 0,
                totalPaymentsReceived: 0,
                totalPaymentsMade: 0,
                lastInvoiceNumber: 0,
                orderIds: []
            });
        } else {
            await summary.update({
                openingBalance: amount,
                openingBalanceSetAt: new Date(),
                openingBalanceSetBy: setBy
            });
        }
        
        return summary;
    },

    // Get summary for a specific date
    getSummaryByDate: async (date) => {
        const dateStr = moment(date).format('YYYY-MM-DD');
        
        const summary = await db.dailySummary.findOne({
            where: { date: dateStr }
        });
        
        return summary;
    },

    // Update summary when order is created
    recordOrderCreated: async (order, transaction = null) => {
        const today = moment().format('YYYY-MM-DD');
        const options = transaction ? { transaction } : {};
        
        let summary = await db.dailySummary.findOne({
            where: { date: today },
            ...options
        });
        
        if (!summary) {
            summary = await db.dailySummary.create({
                id: uuidv4(),
                date: today,
                totalSales: order.total || 0,
                totalOrders: 1,
                totalPurchases: 0,
                totalPaymentsReceived: 0,
                totalPaymentsMade: 0,
                lastInvoiceNumber: 1,
                orderIds: [order.id]
            }, options);
        } else {
            // Check if day is closed
            if (summary.isClosed) {
                throw new Error('Cannot create orders - day is closed by admin');
            }
            
            const orderIds = summary.orderIds || [];
            
            // Prevent double entry - check if order already exists
            if (orderIds.includes(order.id)) {
                console.log(`Order ${order.id} already recorded in daily summary, skipping`);
                return summary;
            }
            
            orderIds.push(order.id);
            
            await summary.update({
                totalSales: (summary.totalSales || 0) + (order.total || 0),
                totalOrders: (summary.totalOrders || 0) + 1,
                lastInvoiceNumber: (summary.lastInvoiceNumber || 0) + 1,
                orderIds
            }, options);
        }
        
        return summary;
    },

    // Update summary when order is deleted (admin only)
    recordOrderDeleted: async (order, transaction = null) => {
        const orderDate = order.orderDate 
            ? moment(order.orderDate, ['DD-MM-YYYY', 'YYYY-MM-DD']).format('YYYY-MM-DD')
            : moment(order.createdAt).format('YYYY-MM-DD');
        
        const options = transaction ? { transaction } : {};
        
        const summary = await db.dailySummary.findOne({
            where: { date: orderDate },
            ...options
        });
        
        if (summary) {
            const orderIds = (summary.orderIds || []).filter(id => id !== order.id);
            
            await summary.update({
                totalSales: Math.max(0, (summary.totalSales || 0) - (order.total || 0)),
                totalOrders: Math.max(0, (summary.totalOrders || 0) - 1),
                orderIds
            }, options);
        }
        
        return summary;
    },

    // Get summaries for date range
    getSummariesInRange: async (startDate, endDate) => {
        const start = moment(startDate).format('YYYY-MM-DD');
        const end = moment(endDate).format('YYYY-MM-DD');
        
        const summaries = await db.dailySummary.findAll({
            where: {
                date: {
                    [Op.between]: [start, end]
                }
            },
            order: [['date', 'DESC']]
        });
        
        return summaries;
    },

    // Close day (admin only) - prevents further modifications
    closeDay: async (date, userId, notes = null) => {
        const dateStr = moment(date).format('YYYY-MM-DD');
        
        let summary = await db.dailySummary.findOne({
            where: { date: dateStr }
        });
        
        if (!summary) {
            throw new Error('No records found for this date');
        }
        
        await summary.update({
            isClosed: true,
            closedAt: new Date(),
            closedBy: userId,
            notes: notes || summary.notes
        });
        
        return summary;
    },

    // Reopen day (admin only)
    reopenDay: async (date, userId) => {
        const dateStr = moment(date).format('YYYY-MM-DD');
        
        const summary = await db.dailySummary.findOne({
            where: { date: dateStr }
        });
        
        if (!summary) {
            throw new Error('No records found for this date');
        }
        
        await summary.update({
            isClosed: false,
            closedAt: null,
            closedBy: null
        });
        
        return summary;
    },

    // Recalculate summary from actual orders (admin utility)
    recalculateSummary: async (date) => {
        const dateStr = moment(date).format('YYYY-MM-DD');
        const startOfDay = moment(dateStr).startOf('day').toDate();
        const endOfDay = moment(dateStr).endOf('day').toDate();
        
        // Get all orders for this date
        const orders = await db.order.findAll({
            where: {
                createdAt: {
                    [Op.between]: [startOfDay, endOfDay]
                }
            }
        });
        
        const totalSales = orders.reduce((sum, o) => sum + (o.total || 0), 0);
        const totalOrders = orders.length;
        const orderIds = orders.map(o => o.id);
        
        let summary = await db.dailySummary.findOne({
            where: { date: dateStr }
        });
        
        if (!summary) {
            summary = await db.dailySummary.create({
                id: uuidv4(),
                date: dateStr,
                totalSales,
                totalOrders,
                orderIds,
                lastInvoiceNumber: totalOrders
            });
        } else {
            await summary.update({
                totalSales,
                totalOrders,
                orderIds
            });
        }
        
        return summary;
    }
};
