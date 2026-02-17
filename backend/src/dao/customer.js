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
                order: [['createdAt', 'DESC']]
            });

            // Get all payments from this customer by ID only
            // Sort by createdAt DESC (most recent first - date added)
            const payments = await db.payment.findAll({
                where: { 
                    partyId: customerId,
                    partyType: 'customer'
                },
                attributes: ['id', 'paymentNumber', 'paymentDate', 'amount', 'referenceType', 'notes', 'createdAt'],
                order: [['createdAt', 'DESC']]
            });

            // Calculate totals
            // Debit = Opening + Sales (what they owe us)
            const totalDebit = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0) + (Number(customer.openingBalance) || 0);
            // Credit = Payments received
            const totalCredit = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const balance = totalDebit - totalCredit; // Positive = they owe us

            return {
                ...customer.toJSON(),
                totalDebit,
                totalCredit,
                balance,
                orders,
                payments
            };
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },

    // List customers with calculated balance (NOT stored balance)
    // This ensures balance is always accurate from actual transactions
    // Match by customerId primarily, but also include legacy orders by customerName
    listCustomersWithBalance: async (params = {}) => {
        try {
            // Get all customers with dynamically calculated balance
            // Balance = Opening + Total Sales - Total Payments Received
            // This matches the logic in getCustomerWithTransactions
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
                    COALESCE(c."openingBalance", 0) + 
                    COALESCE((
                        SELECT SUM(total) 
                        FROM orders 
                        WHERE ("customerId" = c.id OR ("customerName" = c.name AND "customerId" IS NULL))
                        AND "isDeleted" = false
                    ), 0) -
                    COALESCE((
                        SELECT SUM(amount) 
                        FROM payments 
                        WHERE "partyId" = c.id
                        AND "partyType" = 'customer'
                    ), 0) as balance,
                    COALESCE((
                        SELECT SUM(total) 
                        FROM orders 
                        WHERE ("customerId" = c.id OR ("customerName" = c.name AND "customerId" IS NULL))
                        AND "isDeleted" = false
                    ), 0) as "totalDebit",
                    COALESCE((
                        SELECT SUM(amount) 
                        FROM payments 
                        WHERE "partyId" = c.id
                        AND "partyType" = 'customer'
                    ), 0) as "totalCredit"
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
