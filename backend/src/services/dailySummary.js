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
    // This is the source of truth for cash drawer calculation
    // 
    // CRITICAL PRINCIPLE:
    // Cash in drawer from sales = Sum of paidAmount from ALL orders created today
    // This automatically includes:
    //   - Full amount from PAID orders
    //   - Partial amount from PARTIAL orders  
    //   - Zero from UNPAID orders
    //
    // Customer Receipts = Payments received today for PAST orders (different dates)
    // These add to cash drawer but are NOT from today's sales
    //
    // Credit Outstanding = Sum of dueAmount from today's orders (NOT in drawer)
    getRealTimeSummary: async (date) => {
        const dateDDMMYYYY = moment(date).format('DD-MM-YYYY');
        
        // Get all orders for this date
        const orders = await db.order.findAll({
            where: {
                orderDate: dateDDMMYYYY,
                isDeleted: false
            }
        });
        
        // Calculate totals based on ACTUAL cash received from today's orders
        const paidOrders = orders.filter(o => o.paymentStatus === 'paid');
        const unpaidOrders = orders.filter(o => o.paymentStatus === 'unpaid');
        const partialOrders = orders.filter(o => o.paymentStatus === 'partial');
        
        // Cash from today's orders = sum of paidAmount from ALL orders
        // This is the definitive amount that went into the cash drawer from sales
        const cashFromTodaysOrders = orders.reduce((sum, o) => sum + (Number(o.paidAmount) || 0), 0);
        
        // Credit outstanding from today's orders (what customers still owe)
        const creditOutstanding = orders.reduce((sum, o) => sum + (Number(o.dueAmount) || 0), 0);
        
        // Total business done (all orders regardless of payment status)
        const totalBusinessDone = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        
        // Get payments for this date - try multiple date formats
        const dateYYYYMMDD = moment(date).format('YYYY-MM-DD');
        const dateDDMMYYYY_dash = moment(date).format('DD-MM-YYYY');
        const dateDDMMYYYY_slash = moment(date).format('DD/MM/YYYY');
        
        const payments = await db.payment.findAll({
            where: {
                [db.Sequelize.Op.or]: [
                    { paymentDate: dateDDMMYYYY },
                    { paymentDate: dateDDMMYYYY_dash },
                    { paymentDate: dateDDMMYYYY_slash },
                    { paymentDate: dateYYYYMMDD }
                ]
            }
        });
        
        console.log(`[getRealTimeSummary] Date: ${dateDDMMYYYY}, Payments found: ${payments.length}`);
        console.log(`[getRealTimeSummary] Payments breakdown:`, {
            customer: payments.filter(p => p.partyType === 'customer').length,
            supplier: payments.filter(p => p.partyType === 'supplier').length,
            expense: payments.filter(p => p.partyType === 'expense').length
        });
        
        // Get IDs of TODAY's orders
        const todaysOrderIds = orders.map(o => o.id);
        
        // Customer receipts for PAST orders (orders from different dates)
        // These are payments where referenceType is 'order' and referenceId is NOT in today's orders
        // OR where there's no referenceId but the payment was auto-applied to old orders
        // SIMPLIFIED: We count customer payments that are NOT linked to today's orders
        const customerPaymentsAll = payments.filter(p => p.partyType === 'customer');
        
        // DEBUG: Log payments that are linked to today's orders
        const paymentsForTodaysOrders = customerPaymentsAll.filter(p => 
            p.referenceType === 'order' && todaysOrderIds.includes(p.referenceId)
        );
        
        console.log(`[getRealTimeSummary] Customer payments for TODAY's orders (excluded from receipts):`, {
            count: paymentsForTodaysOrders.length,
            totalAmount: paymentsForTodaysOrders.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
            payments: paymentsForTodaysOrders.map(p => ({
                id: p.id,
                amount: p.amount,
                referenceId: p.referenceId,
                referenceType: p.referenceType
            }))
        });
        
        // Payments for past dues = customer payments MINUS payments for today's orders
        // Note: When a payment auto-applies to orders, the order's paidAmount is updated
        // So we should NOT double count by adding payments that updated today's orders
        const customerReceiptsForPastDues = customerPaymentsAll
            .filter(p => {
                // Exclude payments explicitly linked to today's orders
                if (p.referenceType === 'order' && todaysOrderIds.includes(p.referenceId)) {
                    return false;
                }
                // For auto-applied payments (no referenceId), we can't easily tell
                // which orders they affected. For safety, include them as past dues.
                // This might cause some inaccuracy if auto-applied to today's orders.
                return true;
            })
            .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        
        console.log(`[getRealTimeSummary] Customer receipts for PAST orders (included):`, {
            amount: customerReceiptsForPastDues
        });
        
        const customerReceiptsCountForPastDues = customerPaymentsAll
            .filter(p => !(p.referenceType === 'order' && todaysOrderIds.includes(p.referenceId)))
            .length;
        
        // Supplier payments (cash going out)
        const supplierPaymentsAmount = payments
            .filter(p => p.partyType === 'supplier')
            .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        
        // Expense payments (cash going out)  
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
            // Cash from today's sales (paidAmount from all today's orders)
            cashSales: cashFromTodaysOrders,
            // Credit outstanding (dueAmount from today's orders - NOT in drawer)
            creditSales: creditOutstanding,
            // Total business done today
            totalBusinessDone: totalBusinessDone,
            // Customer payments for PAST dues (additional cash in drawer)
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
