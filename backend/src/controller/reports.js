const Services = require('../services');
const db = require('../models');
const { Op } = require('sequelize');

module.exports = {
    getOutstandingReceivables: async (req, res) => {
        try {
            // Get outstanding receivables from orders (credit sales)
            // Include orders where paymentStatus is unpaid/partial OR dueAmount > 0 OR paidAmount < total
            const unpaidOrders = await db.order.findAll({
                where: {
                    isDeleted: false,
                    [Op.or]: [
                        { paymentStatus: { [Op.in]: ['unpaid', 'partial'] } },
                        { dueAmount: { [Op.gt]: 0 } },
                        db.Sequelize.literal('"paidAmount" < "total"')
                    ]
                },
                attributes: ['id', 'orderNumber', 'orderDate', 'customerName', 'customerMobile', 'total', 'paidAmount', 'dueAmount', 'paymentStatus'],
                order: [['customerName', 'ASC'], ['orderDate', 'DESC']]
            });

            // Group by customer name
            const customerMap = {};
            unpaidOrders.forEach(order => {
                const name = (order.customerName || '').trim() || 'Walk-in Customer';
                if (!customerMap[name]) {
                    customerMap[name] = {
                        customerName: name,
                        name: name, // alias for compatibility
                        customerMobile: order.customerMobile || '',
                        totalOutstanding: 0,
                        outstanding: 0, // alias for compatibility
                        orderCount: 0,
                        count: 0, // alias for compatibility
                        orders: []
                    };
                }
                // Calculate due amount - handle cases where dueAmount might not be set
                let due = 0;
                if (order.dueAmount != null && order.dueAmount > 0) {
                    due = order.dueAmount;
                } else {
                    due = (order.total || 0) - (order.paidAmount || 0);
                }
                
                if (due > 0) {
                    customerMap[name].totalOutstanding += due;
                    customerMap[name].outstanding = customerMap[name].totalOutstanding;
                    customerMap[name].orderCount += 1;
                    customerMap[name].count = customerMap[name].orderCount;
                    customerMap[name].orders.push({
                        id: order.id,
                        orderNumber: order.orderNumber,
                        orderDate: order.orderDate,
                        total: order.total,
                        paidAmount: order.paidAmount || 0,
                        dueAmount: due,
                        paymentStatus: order.paymentStatus || 'unpaid'
                    });
                }
            });

            const receivables = Object.values(customerMap).filter(c => c.totalOutstanding > 0);
            receivables.sort((a, b) => b.totalOutstanding - a.totalOutstanding); // Sort by highest due first

            const totalReceivable = receivables.reduce((sum, c) => sum + c.totalOutstanding, 0);

            return res.status(200).send({
                status: 200,
                message: 'outstanding receivables fetched successfully',
                data: receivables,
                totalReceivable: totalReceivable
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
            // Get outstanding payables from purchase bills
            const unpaidPurchases = await db.purchaseBill.findAll({
                where: {
                    paymentStatus: {
                        [Op.in]: ['unpaid', 'partial']
                    }
                },
                include: [{
                    model: db.supplier,
                    attributes: ['id', 'name', 'mobile']
                }],
                attributes: ['id', 'billNumber', 'billDate', 'total', 'paidAmount', 'dueAmount', 'paymentStatus', 'supplierId'],
                order: [['billDate', 'DESC']]
            });

            // Group by supplier
            const supplierMap = {};
            unpaidPurchases.forEach(purchase => {
                const supplierId = purchase.supplierId;
                const supplierName = purchase.supplier?.name || 'Unknown';
                if (!supplierMap[supplierId]) {
                    supplierMap[supplierId] = {
                        supplierId: supplierId,
                        supplierName: supplierName,
                        supplierMobile: purchase.supplier?.mobile,
                        totalOutstanding: 0,
                        billCount: 0,
                        bills: []
                    };
                }
                const due = purchase.dueAmount || (purchase.total - (purchase.paidAmount || 0));
                supplierMap[supplierId].totalOutstanding += due;
                supplierMap[supplierId].billCount += 1;
                supplierMap[supplierId].bills.push({
                    id: purchase.id,
                    billNumber: purchase.billNumber,
                    billDate: purchase.billDate,
                    total: purchase.total,
                    paidAmount: purchase.paidAmount || 0,
                    dueAmount: due,
                    paymentStatus: purchase.paymentStatus
                });
            });

            const payables = Object.values(supplierMap).filter(s => s.totalOutstanding > 0);
            payables.sort((a, b) => b.totalOutstanding - a.totalOutstanding);

            const totalPayable = payables.reduce((sum, s) => sum + s.totalOutstanding, 0);

            return res.status(200).send({
                status: 200,
                message: 'outstanding payables fetched successfully',
                data: payables,
                totalPayable: totalPayable
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
