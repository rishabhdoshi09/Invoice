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

    // Get customer with debit/credit details
    // Match by customerId primarily, but also include legacy orders matched by customerName
    getCustomerWithTransactions: async (customerId) => {
        try {
            const customer = await db.customer.findByPk(customerId);
            if (!customer) return null;

            // Get all orders for this customer
            // Match by customerId OR customerName (for legacy data without customerId)
            const orders = await db.order.findAll({
                where: { 
                    [db.Sequelize.Op.or]: [
                        { customerId: customerId },
                        { 
                            customerName: customer.name,
                            customerId: null  // Only match by name if customerId is not set
                        }
                    ],
                    isDeleted: false
                },
                attributes: ['id', 'orderNumber', 'orderDate', 'total', 'paidAmount', 'dueAmount', 'paymentStatus', 'createdAt', 'customerId'],
                order: [['createdAt', 'ASC']]  // Oldest first for FIFO payment allocation
            });

            // Get all non-deleted payments from this customer
            // Match by partyId OR partyName (for legacy data without partyId)
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
                    isDeleted: false
                },
                attributes: ['id', 'paymentNumber', 'paymentDate', 'amount', 'referenceType', 'referenceId', 'notes', 'createdAt', 'isDeleted'],
                order: [['createdAt', 'ASC']]
            });

            // Calculate totals from orders
            const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
            const totalPaid = orders.reduce((sum, o) => sum + (Number(o.paidAmount) || 0), 0);
            const totalDue = orders.reduce((sum, o) => sum + (Number(o.dueAmount) || 0), 0);
            
            // Standalone payments = receipts/advances NOT linked to a specific order
            const standalonePaymentTotal = payments
                .filter(p => p.referenceType !== 'order')
                .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            
            const openingBal = Number(customer.openingBalance) || 0;
            
            // Standalone payments can offset up to (opening balance + total remaining due).
            // Cap prevents double-counting: if orders are fully paid (due=0) AND opening=0,
            // the advance won't create a negative balance (receipt-first, paid-order-later workflow).
            // But if there IS outstanding due, the advance correctly reduces it.
            const maxOffset = Math.max(0, openingBal + totalDue);
            const standaloneOffset = Math.min(standalonePaymentTotal, maxOffset);
            
            // Total Debit = Opening Balance + All invoice totals
            const totalDebit = totalSales + openingBal;
            
            // Total Credit = Order payments (from paidAmount) + Standalone offset
            const totalCredit = Math.round((totalPaid + standaloneOffset) * 100) / 100;
            
            // Balance = (Opening + Due) - standaloneOffset
            const balance = Math.round((openingBal + totalDue - standaloneOffset) * 100) / 100;

            // Sort orders by date DESC for display (most recent first)
            orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            // Sort payments by date DESC for display
            payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            return {
                ...customer.toJSON(),
                totalDebit,
                totalCredit,
                balance,
                orders: orders.map(o => o.toJSON ? o.toJSON() : o),
                payments: payments.map(p => p.toJSON ? p.toJSON() : p)
            };
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },

    // List customers with calculated balance
    // Balance = Opening Balance + Sum of all order dueAmounts (source of truth)
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
                    COALESCE(c."openingBalance", 0) + COALESCE((
                        SELECT SUM(total) 
                        FROM orders 
                        WHERE ("customerId" = c.id OR ("customerName" = c.name AND "customerId" IS NULL))
                        AND "isDeleted" = false
                    ), 0) as "totalDebit",
                    COALESCE((
                        SELECT SUM("paidAmount") 
                        FROM orders 
                        WHERE ("customerId" = c.id OR ("customerName" = c.name AND "customerId" IS NULL))
                        AND "isDeleted" = false
                    ), 0) + LEAST(
                        GREATEST(
                            COALESCE(c."openingBalance", 0) + COALESCE((
                                SELECT SUM("dueAmount") 
                                FROM orders 
                                WHERE ("customerId" = c.id OR ("customerName" = c.name AND "customerId" IS NULL))
                                AND "isDeleted" = false
                            ), 0),
                            0
                        ),
                        COALESCE((
                            SELECT SUM(amount) 
                            FROM payments 
                            WHERE "partyType" = 'customer'
                            AND ("partyId" = c.id OR ("partyName" = c.name AND "partyId" IS NULL))
                            AND "isDeleted" = false
                            AND ("referenceType" IS NULL OR "referenceType" != 'order')
                        ), 0)
                    ) as "totalCredit",
                    GREATEST(
                        COALESCE(c."openingBalance", 0) + COALESCE((
                            SELECT SUM("dueAmount") 
                            FROM orders 
                            WHERE ("customerId" = c.id OR ("customerName" = c.name AND "customerId" IS NULL))
                            AND "isDeleted" = false
                        ), 0),
                        0
                    ) - LEAST(
                        GREATEST(
                            COALESCE(c."openingBalance", 0) + COALESCE((
                                SELECT SUM("dueAmount") 
                                FROM orders 
                                WHERE ("customerId" = c.id OR ("customerName" = c.name AND "customerId" IS NULL))
                                AND "isDeleted" = false
                            ), 0),
                            0
                        ),
                        COALESCE((
                            SELECT SUM(amount) 
                            FROM payments 
                            WHERE "partyType" = 'customer'
                            AND ("partyId" = c.id OR ("partyName" = c.name AND "partyId" IS NULL))
                            AND "isDeleted" = false
                            AND ("referenceType" IS NULL OR "referenceType" != 'order')
                        ), 0)
                    ) as balance
                FROM customers c
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
