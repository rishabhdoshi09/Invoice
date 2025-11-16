const Services = require('../services');
const db = require('../models');

module.exports = {
    getOutstandingReceivables: async (req, res) => {
        try {
            // Get all customers with outstanding balance (currentBalance > 0)
            const customers = await db.customer.findAll({
                where: {
                    currentBalance: {
                        [db.Sequelize.Op.gt]: 0
                    }
                },
                attributes: ['id', 'name', 'mobile', 'currentBalance'],
                include: [{
                    model: db.order,
                    where: {
                        paymentStatus: {
                            [db.Sequelize.Op.in]: ['unpaid', 'partial']
                        }
                    },
                    required: false,
                    attributes: ['id', 'orderNumber', 'orderDate', 'total', 'paidAmount', 'dueAmount', 'paymentStatus']
                }],
                order: [['name', 'ASC']]
            });

            let totalReceivable = 0;
            customers.forEach(customer => {
                totalReceivable += customer.currentBalance || 0;
            });

            return res.status(200).send({
                status: 200,
                message: 'outstanding receivables fetched successfully',
                data: {
                    totalReceivable,
                    customers: customers
                }
            });

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },

    getOutstandingPayables: async (req, res) => {
        try {
            // Get all suppliers with outstanding balance
            const suppliers = await db.supplier.findAll({
                where: {
                    currentBalance: {
                        [db.Sequelize.Op.gt]: 0
                    }
                },
                attributes: ['id', 'name', 'mobile', 'currentBalance'],
                include: [{
                    model: db.purchaseBill,
                    where: {
                        paymentStatus: {
                            [db.Sequelize.Op.in]: ['unpaid', 'partial']
                        }
                    },
                    required: false,
                    attributes: ['id', 'billNumber', 'billDate', 'total', 'paidAmount', 'dueAmount', 'paymentStatus']
                }],
                order: [['name', 'ASC']]
            });

            let totalPayable = 0;
            suppliers.forEach(supplier => {
                totalPayable += supplier.currentBalance || 0;
            });

            return res.status(200).send({
                status: 200,
                message: 'outstanding payables fetched successfully',
                data: {
                    totalPayable,
                    suppliers
                }
            });

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },

    getPartyStatement: async (req, res) => {
        try {
            const { partyId, partyType } = req.params;

            if (!partyId || !partyType || !['customer', 'supplier'].includes(partyType)) {
                return res.status(400).send({
                    status: 400,
                    message: 'Invalid party ID or type'
                });
            }

            let partyInfo, transactions = [];

            if (partyType === 'supplier') {
                // Get supplier info
                partyInfo = await Services.supplier.getSupplier({ id: partyId });
                
                if (!partyInfo) {
                    return res.status(400).send({
                        status: 400,
                        message: 'Supplier not found'
                    });
                }

                // Get purchase bills
                const purchases = await db.purchaseBill.findAll({
                    where: { supplierId: partyId },
                    order: [['billDate', 'DESC']]
                });

                purchases.forEach(purchase => {
                    transactions.push({
                        date: purchase.billDate,
                        type: 'Purchase',
                        referenceNumber: purchase.billNumber,
                        debit: 0,
                        credit: purchase.total,
                        balance: 0 // Will calculate below
                    });
                });

                // Get payments
                const payments = await db.payment.findAll({
                    where: { 
                        partyId: partyId,
                        partyType: 'supplier'
                    },
                    order: [['paymentDate', 'DESC']]
                });

                payments.forEach(payment => {
                    transactions.push({
                        date: payment.paymentDate,
                        type: 'Payment',
                        referenceNumber: payment.paymentNumber,
                        debit: payment.amount,
                        credit: 0,
                        balance: 0
                    });
                });

            } else {
                // For customers, we'll use order data with customerMobile or customerName
                // This is a simplified version - you might want to create a separate customer table
                const orders = await db.order.findAll({
                    where: db.Sequelize.or(
                        { customerMobile: partyId },
                        { id: partyId }
                    ),
                    order: [['orderDate', 'DESC']]
                });

                if (!orders || orders.length === 0) {
                    return res.status(400).send({
                        status: 400,
                        message: 'Customer not found'
                    });
                }

                partyInfo = {
                    name: orders[0].customerName,
                    mobile: orders[0].customerMobile
                };

                orders.forEach(order => {
                    transactions.push({
                        date: order.orderDate,
                        type: 'Sale',
                        referenceNumber: order.orderNumber,
                        debit: order.total,
                        credit: 0,
                        balance: 0
                    });
                });

                // Get payments
                const payments = await db.payment.findAll({
                    where: { 
                        partyId: partyId,
                        partyType: 'customer'
                    },
                    order: [['paymentDate', 'DESC']]
                });

                payments.forEach(payment => {
                    transactions.push({
                        date: payment.paymentDate,
                        type: 'Payment',
                        referenceNumber: payment.paymentNumber,
                        debit: payment.amount,
                        credit: 0,
                        balance: 0
                    });
                });
            }

            // Sort all transactions by date
            transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Calculate running balance
            let balance = partyType === 'supplier' ? (partyInfo.openingBalance || 0) : 0;
            transactions.forEach(txn => {
                balance = (partyType === 'supplier') ? balance + txn.credit - txn.debit : balance + txn.debit - txn.credit;
                txn.balance = balance;
            });

            return res.status(200).send({
                status: 200,
                message: 'party statement fetched successfully',
                data: {
                    partyInfo,
                    partyType,
                    transactions,
                    currentBalance: balance
                }
            });

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    }
};
