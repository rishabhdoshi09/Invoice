const Services = require('../services');
const db = require('../models');
const { Op } = require('sequelize');

module.exports = {
    // Get outstanding receivables - calculated from orders (single source of truth)
    getOutstandingReceivables: async (req, res) => {
        try {
            // Use the same calculation as listCustomersWithBalance for consistency
            // This calculates balance as: openingBalance + SUM(dueAmount from orders)
            const customersWithBalance = await db.sequelize.query(`
                SELECT 
                    c.id as "customerId",
                    c.name as "customerName",
                    c.mobile as "customerMobile",
                    COALESCE(c."openingBalance", 0) as "openingBalance",
                    COALESCE(c."openingBalance", 0) + COALESCE((
                        SELECT SUM("dueAmount") 
                        FROM orders 
                        WHERE ("customerId" = c.id OR ("customerName" = c.name AND "customerId" IS NULL))
                        AND "isDeleted" = false
                    ), 0) as "totalOutstanding",
                    COALESCE((
                        SELECT COUNT(*) 
                        FROM orders 
                        WHERE ("customerId" = c.id OR ("customerName" = c.name AND "customerId" IS NULL))
                        AND "isDeleted" = false
                        AND "dueAmount" > 0
                    ), 0) as "orderCount"
                FROM customers c
                WHERE COALESCE(c."openingBalance", 0) + COALESCE((
                    SELECT SUM("dueAmount") 
                    FROM orders 
                    WHERE ("customerId" = c.id OR ("customerName" = c.name AND "customerId" IS NULL))
                    AND "isDeleted" = false
                ), 0) > 0
                ORDER BY "totalOutstanding" DESC
            `, { type: db.Sequelize.QueryTypes.SELECT });

            // Get order details for each customer
            const receivables = await Promise.all(customersWithBalance.map(async (customer) => {
                const orders = await db.order.findAll({
                    where: {
                        [Op.or]: [
                            { customerId: customer.customerId },
                            { customerName: customer.customerName, customerId: null }
                        ],
                        isDeleted: false,
                        dueAmount: { [Op.gt]: 0 }
                    },
                    attributes: ['id', 'orderNumber', 'orderDate', 'total', 'paidAmount', 'dueAmount', 'paymentStatus'],
                    order: [['orderDate', 'DESC']]
                });

                return {
                    ...customer,
                    name: customer.customerName,
                    outstanding: Number(customer.totalOutstanding),
                    totalOutstanding: Number(customer.totalOutstanding),
                    count: Number(customer.orderCount),
                    orderCount: Number(customer.orderCount),
                    openingBalance: Number(customer.openingBalance),
                    orders: orders.map(o => ({
                        id: o.id,
                        orderNumber: o.orderNumber,
                        orderDate: o.orderDate,
                        total: Number(o.total),
                        paidAmount: Number(o.paidAmount) || 0,
                        dueAmount: Number(o.dueAmount),
                        paymentStatus: o.paymentStatus || 'unpaid'
                    }))
                };
            }));

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

    // Get outstanding payables - calculated from purchase bills (single source of truth)
    getOutstandingPayables: async (req, res) => {
        try {
            // Use the same calculation as listSuppliersWithBalance for consistency
            const suppliersWithBalance = await db.sequelize.query(`
                SELECT 
                    s.id as "supplierId",
                    s.name as "supplierName",
                    s.mobile as "supplierMobile",
                    COALESCE(s."openingBalance", 0) as "openingBalance",
                    COALESCE(s."openingBalance", 0) + COALESCE((
                        SELECT SUM("dueAmount") 
                        FROM "purchaseBills" 
                        WHERE "supplierId" = s.id
                    ), 0) as "totalOutstanding",
                    COALESCE((
                        SELECT COUNT(*) 
                        FROM "purchaseBills" 
                        WHERE "supplierId" = s.id
                        AND "dueAmount" > 0
                    ), 0) as "billCount"
                FROM suppliers s
                WHERE COALESCE(s."openingBalance", 0) + COALESCE((
                    SELECT SUM("dueAmount") 
                    FROM "purchaseBills" 
                    WHERE "supplierId" = s.id
                ), 0) > 0
                ORDER BY "totalOutstanding" DESC
            `, { type: db.Sequelize.QueryTypes.SELECT });

            // Get purchase details for each supplier
            const payables = await Promise.all(suppliersWithBalance.map(async (supplier) => {
                const purchases = await db.purchaseBill.findAll({
                    where: {
                        supplierId: supplier.supplierId,
                        dueAmount: { [Op.gt]: 0 }
                    },
                    attributes: ['id', 'billNumber', 'billDate', 'total', 'paidAmount', 'dueAmount', 'paymentStatus'],
                    order: [['billDate', 'DESC']]
                });

                return {
                    ...supplier,
                    name: supplier.supplierName,
                    outstanding: Number(supplier.totalOutstanding),
                    totalOutstanding: Number(supplier.totalOutstanding),
                    count: Number(supplier.billCount),
                    billCount: Number(supplier.billCount),
                    openingBalance: Number(supplier.openingBalance),
                    purchases: purchases.map(p => ({
                        id: p.id,
                        billNumber: p.billNumber,
                        billDate: p.billDate,
                        total: Number(p.total),
                        paidAmount: Number(p.paidAmount) || 0,
                        dueAmount: Number(p.dueAmount),
                        paymentStatus: p.paymentStatus || 'unpaid'
                    }))
                };
            }));

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
