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
    // IMPORTANT: totalSales only tracks PAID orders (cash sales)
    // Unpaid/credit sales are tracked via totalReceivables calculated dynamically
    recordOrderCreated: async (order, transaction = null) => {
        const today = moment().format('YYYY-MM-DD');
        const options = transaction ? { transaction } : {};
        
        let summary = await db.dailySummary.findOne({
            where: { date: today },
            ...options
        });
        
        // Only add to totalSales if order is PAID
        const isPaidOrder = order.paymentStatus === 'paid';
        const orderTotal = Number(order.total) || 0;
        const salesAmount = isPaidOrder ? orderTotal : 0;
        
        if (!summary) {
            summary = await db.dailySummary.create({
                id: uuidv4(),
                date: today,
                totalSales: salesAmount, // Only paid orders count as sales
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
            
            // Convert DECIMAL (returned as string from PostgreSQL) to Number
            const currentSales = Number(summary.totalSales) || 0;
            
            await summary.update({
                totalSales: currentSales + salesAmount, // Only add if paid
                totalOrders: (summary.totalOrders || 0) + 1,
                lastInvoiceNumber: (summary.lastInvoiceNumber || 0) + 1,
                orderIds
            }, options);
        }
        
        return summary;
    },

    // Update summary when order is deleted (admin only)
    // IMPORTANT: Only subtract from totalSales if the order was PAID
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
            
            // Convert DECIMAL (returned as string from PostgreSQL) to Number
            const currentSales = Number(summary.totalSales) || 0;
            const orderTotal = Number(order.total) || 0;
            
            // Only subtract from totalSales if the order was PAID
            const wasPaid = order.paymentStatus === 'paid';
            const salesReduction = wasPaid ? orderTotal : 0;
            
            await summary.update({
                totalSales: Math.max(0, currentSales - salesReduction),
                totalOrders: Math.max(0, (summary.totalOrders || 0) - 1),
                orderIds
            }, options);
        }
        
        return summary;
    },

    // Update summary when order payment status changes
    // Called when toggling between paid/unpaid status
    recordPaymentStatusChange: async (order, oldStatus, newStatus, transaction = null) => {
        // If status didn't actually change, do nothing
        if (oldStatus === newStatus) {
            return null;
        }
        
        const orderDate = order.orderDate 
            ? moment(order.orderDate, ['DD-MM-YYYY', 'YYYY-MM-DD']).format('YYYY-MM-DD')
            : moment(order.createdAt).format('YYYY-MM-DD');
        
        const options = transaction ? { transaction } : {};
        
        const summary = await db.dailySummary.findOne({
            where: { date: orderDate },
            ...options
        });
        
        if (summary) {
            const currentSales = Number(summary.totalSales) || 0;
            const orderTotal = Number(order.total) || 0;
            
            let newTotalSales = currentSales;
            
            // If changed FROM paid TO unpaid: subtract from totalSales
            if (oldStatus === 'paid' && newStatus !== 'paid') {
                newTotalSales = Math.max(0, currentSales - orderTotal);
                console.log(`Order ${order.id} changed from paid to ${newStatus}: subtracting ${orderTotal} from totalSales`);
            }
            // If changed FROM unpaid TO paid: add to totalSales
            else if (oldStatus !== 'paid' && newStatus === 'paid') {
                newTotalSales = currentSales + orderTotal;
                console.log(`Order ${order.id} changed from ${oldStatus} to paid: adding ${orderTotal} to totalSales`);
            }
            
            if (newTotalSales !== currentSales) {
                await summary.update({
                    totalSales: newTotalSales
                }, options);
            }
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
    // IMPORTANT: totalSales only includes PAID orders
    // Uses orderDate field (stored as DD-MM-YYYY string) for accurate date matching
    recalculateSummary: async (date) => {
        const dateStr = moment(date).format('YYYY-MM-DD');
        const dateDDMMYYYY = moment(date).format('DD-MM-YYYY');
        
        // Get all orders for this date by orderDate field (not createdAt)
        const orders = await db.order.findAll({
            where: {
                orderDate: dateDDMMYYYY,
                isDeleted: false
            }
        });
        
        // Only sum PAID orders for totalSales (cash received)
        const paidOrders = orders.filter(o => o.paymentStatus === 'paid');
        const totalSales = paidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const totalOrders = orders.length;
        const orderIds = orders.map(o => o.id);
        
        // Calculate credit sales (unpaid/partial orders)
        const creditOrders = orders.filter(o => o.paymentStatus !== 'paid');
        const totalCreditSales = creditOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        
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
        
        // Return with extra calculated fields
        return {
            ...summary.toJSON(),
            paidOrdersCount: paidOrders.length,
            creditOrdersCount: creditOrders.length,
            totalCreditSales,
            totalBusinessDone: totalSales + totalCreditSales
        };
    },

    // Get real-time summary calculated directly from orders (bypasses cache)
    // This is the source of truth - use when cache seems incorrect
    // 
    // CRITICAL: Cash in drawer calculation:
    // Cash Sales = Sum of paidAmount from ALL orders created today (not just fully paid)
    // This represents actual cash received at time of sale
    // 
    // Customer Receipts = Sum of payments received today (from payments table)
    // These are ADDITIONAL payments received for past dues, NOT the same as order payments
    //
    // Credit Outstanding = Sum of dueAmount from unpaid/partial orders today
    getRealTimeSummary: async (date) => {
        const dateDDMMYYYY = moment(date).format('DD-MM-YYYY');
        
        // Get all orders for this date
        const orders = await db.order.findAll({
            where: {
                orderDate: dateDDMMYYYY,
                isDeleted: false
            }
        });
        
        // Calculate totals based on ACTUAL cash received
        const paidOrders = orders.filter(o => o.paymentStatus === 'paid');
        const unpaidOrders = orders.filter(o => o.paymentStatus === 'unpaid');
        const partialOrders = orders.filter(o => o.paymentStatus === 'partial');
        
        // Cash from PAID orders = full total (they paid everything)
        const cashFromPaidOrders = paidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        
        // Cash from PARTIAL orders = only the paidAmount (not the full total!)
        const cashFromPartialOrders = partialOrders.reduce((sum, o) => sum + (Number(o.paidAmount) || 0), 0);
        
        // Cash from UNPAID orders = 0 (no cash received)
        const cashFromUnpaidOrders = 0;
        
        // TOTAL CASH RECEIVED FROM TODAY'S ORDERS
        const cashSalesFromOrders = cashFromPaidOrders + cashFromPartialOrders + cashFromUnpaidOrders;
        
        // Credit outstanding from today's orders (what customers still owe)
        const creditOutstanding = orders.reduce((sum, o) => sum + (Number(o.dueAmount) || 0), 0);
        
        // Total business done (all orders regardless of payment status)
        const totalBusinessDone = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        
        // Get payments for this date - these are SEPARATE from order creation
        // These are receipts for PAST dues, not current day sales
        const payments = await db.payment.findAll({
            where: {
                paymentDate: dateDDMMYYYY
            }
        });
        
        // Filter out payments that are linked to orders created TODAY
        // to avoid double-counting (order paidAmount already counted above)
        const orderIdsToday = orders.map(o => o.id);
        
        const customerReceiptsForPastDues = payments
            .filter(p => p.partyType === 'customer')
            .filter(p => !orderIdsToday.includes(p.referenceId)) // Exclude payments for today's orders
            .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        
        const customerReceiptsCountForPastDues = payments
            .filter(p => p.partyType === 'customer')
            .filter(p => !orderIdsToday.includes(p.referenceId))
            .length;
        
        const supplierPaymentsAmount = payments
            .filter(p => p.partyType === 'supplier')
            .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        
        const expensePayments = payments
            .filter(p => p.partyType === 'expense')
            .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        
        return {
            date: dateDDMMYYYY,
            // Orders breakdown
            totalOrders: orders.length,
            paidOrdersCount: paidOrders.length,
            unpaidOrdersCount: unpaidOrders.length,
            partialOrdersCount: partialOrders.length,
            // Cash received from today's orders (goes into drawer)
            cashSales: cashSalesFromOrders,
            // Credit outstanding from today (does NOT go into drawer)
            creditSales: creditOutstanding,
            // Total business done today
            totalBusinessDone: totalBusinessDone,
            // Customer payments for PAST dues (additional cash received)
            customerReceiptsCount: customerReceiptsCountForPastDues,
            customerReceipts: customerReceiptsForPastDues,
            // Supplier payments (cash going out)
            supplierPaymentsCount: payments.filter(p => p.partyType === 'supplier').length,
            supplierPayments: supplierPaymentsAmount,
            // Expenses (cash going out)
            expensesCount: payments.filter(p => p.partyType === 'expense').length,
            expenses: expensePayments
        };
    }
};
