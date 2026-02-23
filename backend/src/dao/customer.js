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

            // Get all payments from this customer by ID only
            // Sort by createdAt ASC (oldest first for FIFO allocation)
            const payments = await db.payment.findAll({
                where: { 
                    partyId: customerId,
                    partyType: 'customer'
                },
                attributes: ['id', 'paymentNumber', 'paymentDate', 'amount', 'referenceType', 'notes', 'createdAt'],
                order: [['createdAt', 'ASC']]  // Oldest first
            });

            // Calculate totals
            const totalDebit = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0) + (Number(customer.openingBalance) || 0);
            const totalCredit = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            
            // Balance = Total Debit - Total Credit
            // = (Opening Balance + All Order Totals) - (All Payments Received)
            // This is the actual amount still owed by the customer
            const balance = totalDebit - totalCredit;

            // AUTO-RECONCILE: Distribute payments to orders (FIFO - oldest orders first)
            // This ensures individual order rows show correct paid/due/status
            let remainingPayments = totalCredit;
            
            // First apply to opening balance if any
            let openingBalanceRemaining = Number(customer.openingBalance) || 0;
            if (openingBalanceRemaining > 0 && remainingPayments > 0) {
                const appliedToOpening = Math.min(openingBalanceRemaining, remainingPayments);
                remainingPayments -= appliedToOpening;
            }
            
            // Then apply to orders (oldest first)
            const reconciledOrders = orders.map(order => {
                const orderTotal = Number(order.total) || 0;
                const actualPaid = Math.min(orderTotal, remainingPayments);
                remainingPayments -= actualPaid;  // FIX: subtract actualPaid, not orderTotal
                
                const actualDue = orderTotal - actualPaid;
                const actualStatus = actualDue === 0 ? 'paid' : (actualPaid > 0 ? 'partial' : 'unpaid');
                
                return {
                    ...order.toJSON(),
                    paidAmount: actualPaid,
                    dueAmount: actualDue,
                    paymentStatus: actualStatus
                };
            });

            // Reverse back to DESC order for display (most recent first)
            reconciledOrders.reverse();
            
            // Also reverse payments for display
            const displayPayments = [...payments].reverse();

            return {
                ...customer.toJSON(),
                totalDebit,
                totalCredit,
                balance,
                orders: reconciledOrders,
                payments: displayPayments
            };
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },

    // List customers with calculated balance (NOT stored balance)
    // This ensures balance is always accurate from actual transactions
    // Balance = (Opening Balance + All Order Totals) - All Payments Received
    listCustomersWithBalance: async (params = {}) => {
        try {
            // Get all customers with dynamically calculated balance
            // Balance = totalDebit - totalCredit
            // totalDebit = openingBalance + sum of all order totals
            // totalCredit = sum of all payments received
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
                        SELECT SUM(amount) 
                        FROM payments 
                        WHERE "partyId" = c.id
                        AND "partyType" = 'customer'
                    ), 0) as "totalCredit",
                    (
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
