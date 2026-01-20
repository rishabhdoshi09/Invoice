const Services = require('../services');
const db = require('../models');
const { Op } = require('sequelize');

module.exports = {
    getOutstandingReceivables: async (req, res) => {
        try {
            // Customer map to track all receivables
            const customerMap = {};

            // 1. Get customers with opening balance (currentBalance > 0)
            const customersWithBalance = await db.customer.findAll({
                where: {
                    currentBalance: { [Op.gt]: 0 }
                },
                attributes: ['id', 'name', 'mobile', 'currentBalance', 'openingBalance']
            });

            // Add customers with balance to the map
            customersWithBalance.forEach(customer => {
                const name = (customer.name || '').trim();
                if (name && customer.currentBalance > 0) {
                    customerMap[name] = {
                        customerId: customer.id,
                        customerName: name,
                        name: name,
                        customerMobile: customer.mobile || '',
                        totalOutstanding: customer.currentBalance,
                        outstanding: customer.currentBalance,
                        openingBalance: customer.openingBalance || 0,
                        orderCount: 0,
                        count: 0,
                        orders: [],
                        hasOpeningBalance: true
                    };
                }
            });

            // 2. Get outstanding receivables from orders (credit sales)
            const unpaidOrders = await db.order.findAll({
                where: {
                    isDeleted: false,
                    [Op.or]: [
                        { paymentStatus: { [Op.in]: ['unpaid', 'partial'] } },
                        { dueAmount: { [Op.gt]: 0 } },
                        db.Sequelize.literal('"paidAmount" < "total"')
                    ]
                },
                attributes: ['id', 'orderNumber', 'orderDate', 'customerName', 'customerMobile', 'customerId', 'total', 'paidAmount', 'dueAmount', 'paymentStatus'],
                order: [['customerName', 'ASC'], ['orderDate', 'DESC']]
            });

            // Add/merge orders into customer map
            unpaidOrders.forEach(order => {
                const name = (order.customerName || '').trim() || 'Walk-in Customer';
                
                // Calculate due amount
                let due = 0;
                if (order.dueAmount != null && order.dueAmount > 0) {
                    due = order.dueAmount;
                } else {
                    due = (order.total || 0) - (order.paidAmount || 0);
                }
                
                if (due > 0) {
                    if (!customerMap[name]) {
                        // New customer from orders
                        customerMap[name] = {
                            customerId: order.customerId,
                            customerName: name,
                            name: name,
                            customerMobile: order.customerMobile || '',
                            totalOutstanding: 0,
                            outstanding: 0,
                            openingBalance: 0,
                            orderCount: 0,
                            count: 0,
                            orders: [],
                            hasOpeningBalance: false
                        };
                    }
                    
                    // Don't double count - if customer has opening balance, 
                    // orders are already included in currentBalance
                    if (!customerMap[name].hasOpeningBalance) {
                        customerMap[name].totalOutstanding += due;
                        customerMap[name].outstanding = customerMap[name].totalOutstanding;
                    }
                    
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
            receivables.sort((a, b) => b.totalOutstanding - a.totalOutstanding);

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
            // Supplier map to track all payables
            const supplierMap = {};

            // 1. Get suppliers with opening balance (currentBalance > 0)
            const suppliersWithBalance = await db.supplier.findAll({
                where: {
                    currentBalance: { [Op.gt]: 0 }
                },
                attributes: ['id', 'name', 'mobile', 'currentBalance', 'openingBalance']
            });

            // Add suppliers with balance to the map
            suppliersWithBalance.forEach(supplier => {
                if (supplier.currentBalance > 0) {
                    supplierMap[supplier.id] = {
                        supplierId: supplier.id,
                        supplierName: supplier.name,
                        name: supplier.name,
                        supplierMobile: supplier.mobile || '',
                        totalOutstanding: supplier.currentBalance,
                        outstanding: supplier.currentBalance,
                        openingBalance: supplier.openingBalance || 0,
                        billCount: 0,
                        count: 0,
                        bills: [],
                        hasOpeningBalance: true
                    };
                }
            });

            // 2. Get outstanding payables from purchase bills
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

            // Add/merge purchase bills into supplier map
            unpaidPurchases.forEach(purchase => {
                const supplierId = purchase.supplierId;
                const supplierName = purchase.supplier?.name || 'Unknown';
                
                const due = purchase.dueAmount || (purchase.total - (purchase.paidAmount || 0));
                
                if (due > 0) {
                    if (!supplierMap[supplierId]) {
                        supplierMap[supplierId] = {
                            supplierId: supplierId,
                            supplierName: supplierName,
                            name: supplierName,
                            supplierMobile: purchase.supplier?.mobile || '',
                            totalOutstanding: 0,
                            outstanding: 0,
                            openingBalance: 0,
                            billCount: 0,
                            count: 0,
                            bills: [],
                            hasOpeningBalance: false
                        };
                    }
                    
                    // Don't double count if supplier has opening balance
                    if (!supplierMap[supplierId].hasOpeningBalance) {
                        supplierMap[supplierId].totalOutstanding += due;
                        supplierMap[supplierId].outstanding = supplierMap[supplierId].totalOutstanding;
                    }
                    
                    supplierMap[supplierId].billCount += 1;
                    supplierMap[supplierId].count = supplierMap[supplierId].billCount;
                    supplierMap[supplierId].bills.push({
                        id: purchase.id,
                        billNumber: purchase.billNumber,
                        billDate: purchase.billDate,
                        total: purchase.total,
                        paidAmount: purchase.paidAmount || 0,
                        dueAmount: due,
                        paymentStatus: purchase.paymentStatus
                    });
                }
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
