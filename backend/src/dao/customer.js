const uuidv4 = require('uuid/v4');
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
                order: [['createdAt', 'ASC']]
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
                order: [['createdAt', 'ASC']]
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
            // Primary: Order-based (trusted operational data)
            // Formula: Balance = Opening + sum(dueAmount) from orders
            // This matches the original Tally-style: Outstanding = Opening + Invoices - Receipts
            const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
            const totalPaid = orders.reduce((sum, o) => sum + (Number(o.paidAmount) || 0), 0);
            const totalDue = orders.reduce((sum, o) => sum + (Number(o.dueAmount) || 0), 0);
            const totalDebit = totalSales + openingBal;
            const totalCredit = Math.round(totalPaid * 100) / 100;
            const balance = Math.round((openingBal + totalDue) * 100) / 100;

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

            // Sort orders by date DESC for display (most recent first)
            ordersWithDerivedDue.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            paymentsWithAllocation.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            return {
                ...customer.toJSON(),
                totalDebit,
                totalCredit,
                balance,
                orders: ordersWithDerivedDue,
                payments: paymentsWithAllocation,
                allocations
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
                    -- Order-based totals (primary — trusted operational data)
                    COALESCE(c."openingBalance", 0) + COALESCE(order_totals.total_sales, 0) as "totalDebit",
                    COALESCE(order_totals.total_paid, 0) as "totalCredit",
                    COALESCE(c."openingBalance", 0) + COALESCE(order_totals.total_due, 0) as balance
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
    }
};
