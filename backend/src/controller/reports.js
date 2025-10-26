const Services = require('../services');
const db = require('../models');

module.exports = {
    getOutstandingReceivables: async (req, res) => {
        try {
            // Get all orders with due amounts
            const orders = await db.order.findAll({
                where: {
                    paymentStatus: {
                        [db.Sequelize.Op.in]: ['unpaid', 'partial']
                    }
                },
                attributes: ['id', 'orderNumber', 'orderDate', 'customerName', 'customerMobile', 'total', 'paidAmount', 'dueAmount', 'paymentStatus'],
                order: [['orderDate', 'DESC']]
            });

            // Group by customer
            const customerOutstanding = {};
            let totalReceivable = 0;

            orders.forEach(order => {
                const customerKey = order.customerName || 'Walk-in Customer';
                if (!customerOutstanding[customerKey]) {
                    customerOutstanding[customerKey] = {
                        customerName: customerKey,
                        customerMobile: order.customerMobile || '',
                        totalDue: 0,
                        orders: []
                    };
                }
                customerOutstanding[customerKey].totalDue += order.dueAmount || 0;
                customerOutstanding[customerKey].orders.push(order);
                totalReceivable += order.dueAmount || 0;
            });

            return res.status(200).send({
                status: 200,
                message: 'outstanding receivables fetched successfully',
                data: {
                    totalReceivable,
                    customers: Object.values(customerOutstanding)
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
                        debit: purchase.total,
                        credit: 0,
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
                        debit: 0,
                        credit: payment.amount,
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
                        debit: 0,
                        credit: payment.amount,
                        balance: 0
                    });
                });
            }

            // Sort all transactions by date
            transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Calculate running balance
            let balance = partyType === 'supplier' ? (partyInfo.openingBalance || 0) : 0;
            transactions.forEach(txn => {
                balance += txn.debit - txn.credit;
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
