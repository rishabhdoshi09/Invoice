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
    getCustomerWithTransactions: async (customerId) => {
        try {
            const customer = await db.customer.findByPk(customerId);
            if (!customer) return null;

            // Get all orders - check both customerId and customerName for backwards compatibility
            const orders = await db.order.findAll({
                where: { 
                    [db.Sequelize.Op.or]: [
                        { customerId: customerId },
                        { customerName: customer.name }
                    ],
                    isDeleted: false
                },
                attributes: ['id', 'orderNumber', 'orderDate', 'total', 'paidAmount', 'dueAmount', 'paymentStatus'],
                order: [['orderDate', 'DESC']]
            });

            // Get all payments from this customer - check both partyId and partyName
            const payments = await db.payment.findAll({
                where: { 
                    [db.Sequelize.Op.or]: [
                        { partyId: customerId },
                        { 
                            partyName: customer.name,
                            partyType: 'customer'
                        }
                    ]
                },
                attributes: ['id', 'paymentNumber', 'paymentDate', 'amount', 'referenceType', 'notes'],
                order: [['paymentDate', 'DESC']]
            });

            // Calculate totals
            // Debit = Opening + Sales (what they owe us)
            const totalDebit = orders.reduce((sum, o) => sum + (o.total || 0), 0) + (customer.openingBalance || 0);
            // Credit = Payments received
            const totalCredit = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
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

    // List customers with debit/credit summary
    listCustomersWithBalance: async (filterObj) => {
        try {
            const customers = await db.customer.findAll({
                ...( filterObj.q && filterObj.q !== "" ? {
                    where: {
                        [db.Sequelize.Op.or]: [
                            { name: { [db.Sequelize.Op.iLike]: `%${filterObj.q}%` } },
                            { mobile: { [db.Sequelize.Op.iLike]: `%${filterObj.q}%` } }
                        ]
                    }}
                : {}),
                order: [['name', 'ASC']]
            });

            const customersWithBalance = await Promise.all(customers.map(async (customer) => {
                // Get all orders (debit - what they owe)
                const orderTotal = await db.order.sum('total', {
                    where: { 
                        customerName: customer.name,
                        isDeleted: false
                    }
                }) || 0;

                // Get payments by ID
                const paymentByIdTotal = await db.payment.sum('amount', {
                    where: { partyId: customer.id }
                }) || 0;
                
                // Get payments by name (for backwards compatibility)
                const paymentByNameTotal = await db.payment.sum('amount', {
                    where: { 
                        partyName: customer.name,
                        partyType: 'customer',
                        partyId: null
                    }
                }) || 0;

                const totalDebit = orderTotal + (customer.openingBalance || 0);
                const totalCredit = paymentByIdTotal + paymentByNameTotal;
                const balance = totalDebit - totalCredit;

                return {
                    ...customer.toJSON(),
                    totalDebit,
                    totalCredit,
                    balance
                };
            }));

            return {
                count: customersWithBalance.length,
                rows: customersWithBalance
            };
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    }
};
