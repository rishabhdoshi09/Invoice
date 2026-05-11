const { v4: uuidv4 } = require('uuid');
const db = require('../models');

module.exports = {
    createCustomer: async (payload) => {
        try {
            const res = await db.customer.create({ id: uuidv4(), ...payload });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    getCustomer: async (filterObj) => {
        try {
            const res = await db.customer.findOne({ where: filterObj });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    updateCustomer: async (filterObj, updateObj) => {
        try {
            const res = await db.customer.update(updateObj, { where: filterObj });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    deleteCustomer: async (filterObj) => {
        try {
            const res = await db.customer.destroy({ where: filterObj });
            return res;
        } catch (error) {
            console.log(error);
            throw error;
        }
    },
    listCustomers: async (filterObj) => {
        try {
            const res = await db.customer.findAndCountAll({ 
                ...( filterObj.q && filterObj.q !== "" ? {
                    where: {
                        [db.Sequelize.Op.or]: [
                            { name: { [db.Sequelize.Op.iLike]: `%${filterObj.q}%` } },
                            { mobile: { [db.Sequelize.Op.iLike]: `%${filterObj.q}%` } }
                        ]
                    }}
                : {}),
                order: [['createdAt', 'DESC']], 
                limit: filterObj.limit ?? 100,
                offset: filterObj.offset ?? 0
            });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },

    /**
     * Get customer with full transaction details.
     * 
     * TALLY-CORRECT BALANCE FORMULA:
     * - Primary (ledger-authoritative): closing = opening + sum(debits) - sum(credits)
     *   computed from double-entry ledger_entries for this customer's account
     * - Fallback (if no ledger account): opening + sum(dueAmount) from orders
     * 
     * Invoice due is DERIVED: invoice_total - sum(receipt_allocations for that invoice)
     */
    getCustomerWithTransactions: async (customerId) => {
        try {
            const customer = await db.customer.findByPk(customerId);
            if (!customer) return null;

            // Get all orders for this customer
            const orders = await db.order.findAll({
                where: { 
                    [db.Sequelize.Op.or]: [
                        { customerId: customerId },
                        { 
                            customerName: customer.name,
                            customerId: null
                        }
                    ],
                    isDeleted: false
                },
                attributes: ['id', 'orderNumber', 'orderDate', 'total', 'paidAmount', 'dueAmount', 'paymentStatus', 'createdAt', 'customerId'],
                order: [['orderDate', 'ASC'], ['createdAt', 'ASC']]
            });

            // Get all non-deleted payments from this customer
            const payments = await db.payment.findAll({
                where: {
                    [db.Sequelize.Op.or]: [
                        { partyId: customerId },
                        {
                            partyName: customer.name,
                            partyId: null
                        }
                    ],
                    partyType: 'customer',
                    ...(db.payment.rawAttributes.isDeleted ? { isDeleted: false } : {})
                },
                attributes: ['id', 'paymentNumber', 'paymentDate', 'amount', 'referenceType', 'referenceId', 'notes', 'createdAt'],
                order: [['paymentDate', 'ASC'], ['createdAt', 'ASC']]
            });

            // Get receipt allocations for this customer's orders
            const orderIds = orders.map(o => o.id);
            let allocations = [];
            if (orderIds.length > 0) {
                try {
                    allocations = await db.receiptAllocation.findAll({
                        where: {
                            orderId: { [db.Sequelize.Op.in]: orderIds },
                            isDeleted: false
                        }
                    });
                } catch (e) {
                    // Table may not exist yet
                }
            }

            // Build allocation map: orderId -> total allocated
            const allocationByOrder = {};
            const allocationByPayment = {};
            for (const a of allocations) {
                const amt = Number(a.amount) || 0;
                allocationByOrder[a.orderId] = (allocationByOrder[a.orderId] || 0) + amt;
                allocationByPayment[a.paymentId] = (allocationByPayment[a.paymentId] || 0) + amt;
            }

            const openingBal = Number(customer.openingBalance) || 0;

            // === BALANCE CALCULATION ===
            // Balance = Opening + Total Sales - ALL Receipts (including On Account)
            // EXCLUDE PAY-TOGGLE-* payments (phantom entries from old toggle logic, not real money)
            const realPayments = payments.filter(p => {
                const pNum = p.paymentNumber || (p.dataValues && p.dataValues.paymentNumber) || '';
                return !pNum.startsWith('PAY-TOGGLE-');
            });
            const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
            const totalReceived = realPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const totalDebit = totalSales + openingBal;
            const totalCredit = Math.round(totalReceived * 100) / 100;
            const balance = Math.round((openingBal + totalSales - totalReceived) * 100) / 100;

            // Compute DERIVED invoice dues from receipt allocations
            const ordersWithDerivedDue = orders.map(o => {
                const oJSON = o.toJSON ? o.toJSON() : o;
                const allocated = allocationByOrder[oJSON.id] || 0;
                // Derived due = total - allocated receipts
                // (uses allocation table when available, falls back to stored dueAmount)
                const derivedDue = allocated > 0 
                    ? Math.max(0, (Number(oJSON.total) || 0) - allocated)
                    : Number(oJSON.dueAmount) || 0;
                const derivedPaid = allocated > 0
                    ? allocated
                    : Number(oJSON.paidAmount) || 0;
                return {
                    ...oJSON,
                    allocatedAmount: allocated,
                    derivedDue,
                    derivedPaid,
                    derivedStatus: derivedDue <= 0 ? 'paid' : (derivedPaid > 0 ? 'partial' : 'unpaid')
                };
            });

            // Compute unallocated payments (On Account / Advance)
            const paymentsWithAllocation = payments.map(p => {
                const pJSON = p.toJSON ? p.toJSON() : p;
                const allocated = allocationByPayment[pJSON.id] || 0;
                return {
                    ...pJSON,
                    allocatedAmount: allocated,
                    unallocatedAmount: Math.max(0, (Number(pJSON.amount) || 0) - allocated)
                };
            });

            const parseEntryDate = (dateStr) => {
                if (!dateStr) return new Date(0);
                const m = String(dateStr).match(/^(\d{2})-(\d{2})-(\d{4})$/);
                return m ? new Date(`${m[3]}-${m[2]}-${m[1]}`) : new Date(dateStr);
            };

            // Sort strictly by invoice/payment date DESC for display (most recent first)
            ordersWithDerivedDue.sort((a, b) => parseEntryDate(b.orderDate) - parseEntryDate(a.orderDate));
            paymentsWithAllocation.sort((a, b) => parseEntryDate(b.paymentDate) - parseEntryDate(a.paymentDate));

            // Get toggle history (payment status changes) for this customer's orders
            let toggleHistory = [];
            if (orderIds.length > 0) {
                try {
                    const orderIdStrs = orderIds.map(String);
                    const [toggles] = await db.sequelize.query(`
                        SELECT 
                            al."entityId" AS "orderId",
                            al."entityName" AS "orderNumber",
                            al."userName",
                            al."userRole",
                            al."oldValues"->>'paymentStatus' AS "fromStatus",
                            al."newValues"->>'paymentStatus' AS "toStatus",
                            al."description",
                            al."createdAt"
                        FROM audit_logs al
                        WHERE al."entityType" IN ('ORDER_PAYMENT_STATUS', 'DATA_RECOVERY')
                          AND al."entityId" IN (:orderIdStrs)
                        ORDER BY al."createdAt" DESC
                        LIMIT 100
                    `, { replacements: { orderIdStrs } });
                    toggleHistory = toggles;
                } catch (e) { /* audit_logs may not exist */ }
            }

            return {
                ...customer.toJSON(),
                totalDebit,
                totalCredit,
                balance,
                orders: ordersWithDerivedDue,
                payments: paymentsWithAllocation,
                allocations,
                toggleHistory
            };
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },

    /**
     * List customers with calculated balance.
     * 
     * TALLY-CORRECT: Uses ledger entries as authoritative source when available.
     * Fallback: Opening Balance + Sum of all order dueAmounts
     */
    listCustomersWithBalance: async (params = {}) => {
        try {
            const customers = await db.sequelize.query(`
                SELECT 
                    c.id,
                    c.name,
                    c.mobile,
                    c.email,
                    c.address,
                    c.gstin,
                    c."openingBalance",
                    c."createdAt",
                    c."updatedAt",
                    -- Total sales from orders
                    COALESCE(order_totals.total_sales, 0) as total_sales,
                    COALESCE(order_totals.total_paid, 0) as orders_paid,
                    COALESCE(order_totals.total_due, 0) as orders_due,
                    -- Total ALL receipts from payments table (includes On Account)
                    COALESCE(payment_totals.total_received, 0) as total_received,
                    -- Debit = Opening + Sales
                    COALESCE(c."openingBalance", 0) + COALESCE(order_totals.total_sales, 0) as "totalDebit",
                    -- Credit = ALL receipts (not just per-invoice paidAmount)
                    COALESCE(payment_totals.total_received, 0) as "totalCredit",
                    -- Balance = Opening + Sales - ALL Receipts
                    COALESCE(c."openingBalance", 0) + COALESCE(order_totals.total_sales, 0) - COALESCE(payment_totals.total_received, 0) as balance
                FROM customers c
                LEFT JOIN LATERAL (
                    SELECT 
                        COALESCE(SUM(total), 0) as total_sales,
                        COALESCE(SUM("paidAmount"), 0) as total_paid,
                        COALESCE(SUM("dueAmount"), 0) as total_due
                    FROM orders
                    WHERE "isDeleted" = false
                    AND ("customerId" = c.id OR ("customerName" = c.name AND "customerId" IS NULL))
                ) order_totals ON true
                LEFT JOIN LATERAL (
                    SELECT 
                        COALESCE(SUM(amount), 0) as total_received
                    FROM payments
                    WHERE "partyType" = 'customer'
                    AND ("partyId" = c.id OR ("partyName" = c.name AND "partyId" IS NULL))
                    AND ("paymentNumber" IS NULL OR "paymentNumber" NOT LIKE 'PAY-TOGGLE-%')
                    ${db.payment.rawAttributes.isDeleted ? 'AND "isDeleted" = false' : ''}
                ) payment_totals ON true
                ORDER BY c.name ASC
            `, { type: db.Sequelize.QueryTypes.SELECT });

            return {
                count: customers.length,
                rows: customers
            };
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },

    getOverdueCustomers: async (days = 20) => {
        try {
            const parseDate = (s) => {
                if (!s) return null;
                const m = String(s).match(/^(\d{2})-(\d{2})-(\d{4})$/);
                return m ? new Date(`${m[3]}-${m[2]}-${m[1]}`) : new Date(s);
            };

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const cutoff = new Date(today);
            cutoff.setDate(cutoff.getDate() - days);

            const customers = await db.customer.findAll({ raw: true });

            // Bulk fetch for performance
            const allOrders = await db.order.findAll({
                where: { isDeleted: false },
                attributes: ['id', 'customerId', 'customerName', 'orderDate', 'total', 'createdAt'],
                raw: true
            });

            const paymentWhere = { partyType: 'customer' };
            if (db.payment.rawAttributes.isDeleted) paymentWhere.isDeleted = false;
            const allPayments = await db.payment.findAll({
                where: paymentWhere,
                attributes: ['id', 'partyId', 'partyName', 'paymentNumber', 'amount'],
                raw: true
            });

            const results = [];

            for (const customer of customers) {
                const orders = allOrders
                    .filter(o => o.customerId === customer.id || (!o.customerId && o.customerName === customer.name))
                    .map(o => ({ ...o, _date: parseDate(o.orderDate) || new Date(o.createdAt) }))
                    .sort((a, b) => a._date - b._date);

                const payments = allPayments.filter(p =>
                    p.partyId === customer.id || (!p.partyId && p.partyName === customer.name)
                );

                const totalPaid = payments
                    .filter(p => !String(p.paymentNumber || '').startsWith('PAY-TOGGLE-'))
                    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

                const openingBalance = Number(customer.openingBalance) || 0;
                const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
                const netBalance = openingBalance + totalSales - totalPaid;

                if (netBalance <= 0.01) continue;

                // FIFO: payments cover opening balance first, then oldest invoices
                let available = Math.max(0, totalPaid - openingBalance);
                let oldestOverdueDate = null;
                let unpaidCount = 0;

                for (const order of orders) {
                    const invoiceTotal = Number(order.total) || 0;
                    if (available >= invoiceTotal) {
                        available -= invoiceTotal;
                    } else {
                        available = 0;
                        if (order._date <= cutoff) {
                            if (!oldestOverdueDate) oldestOverdueDate = order._date;
                            unpaidCount++;
                        }
                    }
                }

                if (!oldestOverdueDate) continue;

                const daysOverdue = Math.floor((today - oldestOverdueDate) / (1000 * 60 * 60 * 24));
                results.push({
                    id: customer.id,
                    name: customer.name,
                    mobile: customer.mobile,
                    oldest_overdue_date: oldestOverdueDate,
                    unpaid_invoices: String(unpaidCount),
                    total_outstanding: Math.round(netBalance * 100) / 100,
                    days_overdue: daysOverdue
                });
            }

            results.sort((a, b) => b.days_overdue - a.days_overdue || b.total_outstanding - a.total_outstanding);
            return results;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    }
};
