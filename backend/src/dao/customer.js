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

            // === Auto-reconcile: apply unallocated standalone payments to unpaid orders ===
            // Fixes historical data where receipts exist but weren't linked to orders
            const standalonePayments = payments.filter(p => p.referenceType !== 'order');
            const unpaidOrders = orders.filter(o => (Number(o.dueAmount) || 0) > 0)
                .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // FIFO

            if (standalonePayments.length > 0 && unpaidOrders.length > 0) {
                let reconciled = false;
                const transaction = await db.sequelize.transaction();
                try {
                    let payIdx = 0;
                    let orderIdx = 0;

                    while (payIdx < standalonePayments.length && orderIdx < unpaidOrders.length) {
                        const payment = standalonePayments[payIdx];
                        const order = unpaidOrders[orderIdx];
                        const orderDue = Number(order.dueAmount) || 0;
                        const payAmt = Number(payment.amount) || 0;

                        if (orderDue <= 0) { orderIdx++; continue; }
                        if (payAmt <= 0) { payIdx++; continue; }

                        const applyAmt = Math.min(payAmt, orderDue);

                        if (applyAmt >= payAmt) {
                            // Full payment consumed — link to order
                            await payment.update({
                                referenceType: 'order',
                                referenceId: order.id,
                                referenceNumber: order.orderNumber
                            }, { transaction });
                            payIdx++;
                        } else {
                            // Partial payment — reduce amount, create linked split
                            await payment.update({
                                amount: payAmt - applyAmt
                            }, { transaction });
                            await db.payment.create({
                                id: require('uuid').v4(),
                                paymentNumber: `PAY-${require('uuid').v4().split('-')[0].toUpperCase()}`,
                                paymentDate: payment.paymentDate,
                                partyId: payment.partyId || customerId,
                                partyName: payment.partyName || customer.name,
                                partyType: 'customer',
                                amount: applyAmt,
                                referenceType: 'order',
                                referenceId: order.id,
                                referenceNumber: order.orderNumber,
                                notes: `Auto-reconciled from ${payment.paymentNumber}`
                            }, { transaction });
                            // Don't advance payIdx — remaining amount may cover next order
                        }

                        // Update order
                        const newPaid = Math.round((Number(order.paidAmount) + applyAmt) * 100) / 100;
                        const newDue = Math.round(Math.max(0, Number(order.total) - newPaid) * 100) / 100;
                        const newStatus = newDue <= 0 ? 'paid' : (newPaid > 0 ? 'partial' : 'unpaid');
                        await order.update({
                            paidAmount: newPaid,
                            dueAmount: newDue,
                            paymentStatus: newStatus
                        }, { transaction });

                        reconciled = true;
                        console.log(`[AUTO-RECONCILE] Applied ₹${applyAmt} from ${payment.paymentNumber} to ${order.orderNumber}`);

                        if (newDue <= 0) orderIdx++;
                    }

                    await transaction.commit();
                } catch (reconErr) {
                    await transaction.rollback();
                    console.error('[AUTO-RECONCILE] Failed:', reconErr.message);
                }

                // If data was fixed, re-fetch fresh values
                if (reconciled) {
                    return module.exports.getCustomerWithTransactions(customerId);
                }
            }

            // Calculate totals from orders
            const totalSales = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
            const totalPaid = orders.reduce((sum, o) => sum + (Number(o.paidAmount) || 0), 0);
            const totalDue = orders.reduce((sum, o) => sum + (Number(o.dueAmount) || 0), 0);
            
            const openingBal = Number(customer.openingBalance) || 0;
            
            // Total Debit = Opening Balance + All invoice totals
            const totalDebit = totalSales + openingBal;
            
            // Total Credit = sum of order paidAmounts (standalone receipts are already
            // reflected in orders.paidAmount via payment controller FIFO — no separate offset)
            const totalCredit = Math.round(totalPaid * 100) / 100;
            
            // Balance = Opening + sum of invoice dues (what customer still owes)
            const balance = Math.round((openingBal + totalDue) * 100) / 100;

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
                    ), 0) as "totalCredit",
                    COALESCE(c."openingBalance", 0) + COALESCE((
                        SELECT SUM("dueAmount") 
                        FROM orders 
                        WHERE ("customerId" = c.id OR ("customerName" = c.name AND "customerId" IS NULL))
                        AND "isDeleted" = false
                    ), 0) as balance
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
