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

            // === TALLY-CORRECT: Try ledger-authoritative balance first ===
            let useLedger = false;
            let ledgerBalance = 0;
            let ledgerDebit = 0;
            let ledgerCredit = 0;

            try {
                const ledgerResult = await db.sequelize.query(`
                    SELECT 
                        COALESCE(SUM(le.debit), 0) as "totalDebit",
                        COALESCE(SUM(le.credit), 0) as "totalCredit",
                        COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0) as balance
                    FROM accounts a
                    INNER JOIN ledger_entries le ON le."accountId" = a.id
                    INNER JOIN journal_batches jb ON le."batchId" = jb.id
                    WHERE a."partyId" = :customerId 
                        AND a."partyType" = 'customer'
                        AND jb."isPosted" = true 
                        AND jb."isReversed" = false
                `, {
                    replacements: { customerId },
                    type: db.Sequelize.QueryTypes.SELECT
                });

                if (ledgerResult && ledgerResult[0] && (Number(ledgerResult[0].totalDebit) > 0 || Number(ledgerResult[0].totalCredit) > 0)) {
                    useLedger = true;
                    ledgerDebit = Number(ledgerResult[0].totalDebit) || 0;
                    ledgerCredit = Number(ledgerResult[0].totalCredit) || 0;
                    // Ledger balance = sum(debits) - sum(credits)
                    // For customer (receivable/asset): positive = they owe us
                    ledgerBalance = ledgerDebit - ledgerCredit;
                }
            } catch (e) {
                // Ledger tables may not exist - fall back
            }

            // Calculate totals from orders (used for display + fallback)
            const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

            let totalDebit, totalCredit, balance;

            if (useLedger) {
                // LEDGER-AUTHORITATIVE: balance from double-entry ledger
                totalDebit = openingBal + ledgerDebit;
                totalCredit = ledgerCredit;
                balance = Math.round((openingBal + ledgerBalance) * 100) / 100;
            } else {
                // FALLBACK: old formula (opening + dueAmount)
                const totalPaid = orders.reduce((sum, o) => sum + (Number(o.paidAmount) || 0), 0);
                const totalDue = orders.reduce((sum, o) => sum + (Number(o.dueAmount) || 0), 0);
                totalDebit = totalSales + openingBal;
                totalCredit = Math.round(totalPaid * 100) / 100;
                balance = Math.round((openingBal + totalDue) * 100) / 100;
            }

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
                balanceSource: useLedger ? 'ledger' : 'orders',
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
                    -- Ledger-based totals (authoritative when available)
                    COALESCE(ledger.ledger_debit, 0) as "ledgerDebit",
                    COALESCE(ledger.ledger_credit, 0) as "ledgerCredit",
                    COALESCE(ledger.ledger_balance, 0) as "ledgerBalance",
                    CASE WHEN ledger.ledger_debit > 0 OR ledger.ledger_credit > 0 
                         THEN true ELSE false END as "hasLedgerData",
                    -- Order-based totals (fallback)
                    COALESCE(c."openingBalance", 0) + COALESCE(order_totals.total_sales, 0) as "orderTotalDebit",
                    COALESCE(order_totals.total_paid, 0) as "orderTotalCredit",
                    COALESCE(c."openingBalance", 0) + COALESCE(order_totals.total_due, 0) as "orderBalance",
                    -- Final computed values (ledger-first, fallback to orders)
                    CASE 
                        WHEN ledger.ledger_debit > 0 OR ledger.ledger_credit > 0 
                        THEN COALESCE(c."openingBalance", 0) + COALESCE(ledger.ledger_debit, 0)
                        ELSE COALESCE(c."openingBalance", 0) + COALESCE(order_totals.total_sales, 0)
                    END as "totalDebit",
                    CASE 
                        WHEN ledger.ledger_debit > 0 OR ledger.ledger_credit > 0 
                        THEN COALESCE(ledger.ledger_credit, 0)
                        ELSE COALESCE(order_totals.total_paid, 0)
                    END as "totalCredit",
                    CASE 
                        WHEN ledger.ledger_debit > 0 OR ledger.ledger_credit > 0 
                        THEN COALESCE(c."openingBalance", 0) + COALESCE(ledger.ledger_balance, 0)
                        ELSE COALESCE(c."openingBalance", 0) + COALESCE(order_totals.total_due, 0)
                    END as balance
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
                        COALESCE(SUM(le.debit), 0) as ledger_debit,
                        COALESCE(SUM(le.credit), 0) as ledger_credit,
                        COALESCE(SUM(le.debit) - SUM(le.credit), 0) as ledger_balance
                    FROM accounts a
                    INNER JOIN ledger_entries le ON le."accountId" = a.id
                    INNER JOIN journal_batches jb ON le."batchId" = jb.id
                    WHERE a."partyId" = c.id 
                        AND a."partyType" = 'customer'
                        AND jb."isPosted" = true 
                        AND jb."isReversed" = false
                ) ledger ON true
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
