const Services = require('../services');
const db = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');
const { computeCustomerOutstandings, computeSupplierOutstandings } = require('../services/partyBalance');

module.exports = {
    // Outstanding receivables — derived from the canonical party-balance
    // service (opening + sales − ALL receipts). The old formula here summed
    // order dueAmounts only, so on-account receipts (the exact thing the
    // /reports "Receive Payment" button records) never reduced the numbers.
    getOutstandingReceivables: async (req, res) => {
        try {
            const all = await computeCustomerOutstandings();
            const owing = all.filter(c => c.balance > 0.009);

            const receivables = await Promise.all(owing.map(async (customer) => {
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
                    outstanding: customer.balance,
                    totalOutstanding: customer.balance,
                    count: customer.openOrderCount,
                    orderCount: customer.openOrderCount,
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

            const totalReceivable = receivables.reduce((sum, c) => sum + c.balance, 0);

            return res.status(200).send({
                status: 200,
                message: 'outstanding receivables fetched successfully',
                data: receivables,
                totalReceivable: Math.round(totalReceivable * 100) / 100
            });

        } catch (error) {
            console.log(error);
            return res.status(500).send({ status: 500, message: error.message });
        }
    },

    // Outstanding payables — canonical formula (opening + bills − paid on
    // bills − other payments). The old formula counted deleted bills and
    // ignored on-account supplier payouts entirely.
    getOutstandingPayables: async (req, res) => {
        try {
            const all = await computeSupplierOutstandings();
            const owed = all.filter(s => s.balance > 0.009);

            const payables = await Promise.all(owed.map(async (supplier) => {
                const purchases = await db.purchaseBill.findAll({
                    where: {
                        supplierId: supplier.supplierId,
                        isDeleted: false,
                        dueAmount: { [Op.gt]: 0 }
                    },
                    attributes: ['id', 'billNumber', 'billDate', 'total', 'paidAmount', 'dueAmount', 'paymentStatus'],
                    order: [['billDate', 'DESC']]
                });

                return {
                    ...supplier,
                    name: supplier.supplierName,
                    outstanding: supplier.balance,
                    totalOutstanding: supplier.balance,
                    count: supplier.openBillCount,
                    billCount: supplier.openBillCount,
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

            const totalPayable = payables.reduce((sum, s) => sum + s.balance, 0);

            return res.status(200).send({
                status: 200,
                message: 'outstanding payables fetched successfully',
                data: payables,
                totalPayable: Math.round(totalPayable * 100) / 100
            });

        } catch (error) {
            console.log(error);
            return res.status(500).send({ status: 500, message: error.message });
        }
    },

    getPartyStatement: async (req, res) => {
        try {
            const { partyId, partyType } = req.params;

            if (!partyId || !partyType || !['customer', 'supplier'].includes(partyType)) {
                return res.status(400).send({ status: 400, message: 'Invalid party ID or type' });
            }

            const parseDate = (s) => {
                const m = moment(s, ['DD-MM-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY'], true);
                return m.isValid() ? m : moment(s);
            };

            let partyInfo;
            const transactions = [];
            let openingBalance = 0;

            if (partyType === 'supplier') {
                partyInfo = await Services.supplier.getSupplier({ id: partyId });
                if (!partyInfo) {
                    return res.status(400).send({ status: 400, message: 'Supplier not found' });
                }
                openingBalance = Number(partyInfo.openingBalance) || 0;

                const purchases = await db.purchaseBill.findAll({
                    where: { supplierId: partyId, isDeleted: false }
                });
                purchases.forEach(p => {
                    transactions.push({
                        date: p.billDate,
                        type: 'Purchase',
                        referenceNumber: p.billNumber,
                        debit: 0,
                        credit: Number(p.total) || 0
                    });
                    // POS/linked payments live on the bill's paidAmount —
                    // purchase-linked payment rows are excluded below to
                    // avoid double counting.
                    if (Number(p.paidAmount) > 0) {
                        transactions.push({
                            date: p.billDate,
                            type: 'Payment (against bill)',
                            referenceNumber: p.billNumber,
                            debit: Number(p.paidAmount) || 0,
                            credit: 0
                        });
                    }
                });

                const paymentWhere = {
                    partyType: 'supplier',
                    referenceType: { [Op.ne]: 'purchase' },
                    [Op.or]: [{ partyId }, { partyName: partyInfo.name, partyId: null }]
                };
                if (db.payment.rawAttributes.isDeleted) paymentWhere.isDeleted = false;
                const payments = await db.payment.findAll({ where: paymentWhere });
                payments.forEach(p => {
                    transactions.push({
                        date: p.paymentDate,
                        type: 'Payment',
                        referenceNumber: p.paymentNumber,
                        debit: Number(p.amount) || 0,
                        credit: 0
                    });
                });

            } else {
                // Customer statement — lookup by real customer id, orders by
                // id-or-legacy-name, receipts as CREDIT (the old code booked
                // customer receipts as debit, INCREASING their balance).
                const customer = await db.customer.findByPk(partyId);
                if (!customer) {
                    return res.status(400).send({ status: 400, message: 'Customer not found' });
                }
                partyInfo = { name: customer.name, mobile: customer.mobile };
                openingBalance = Number(customer.openingBalance) || 0;

                const orders = await db.order.findAll({
                    where: {
                        isDeleted: false,
                        [Op.or]: [
                            { customerId: customer.id },
                            { customerName: customer.name, customerId: null }
                        ]
                    }
                });
                orders.forEach(o => {
                    transactions.push({
                        date: o.orderDate,
                        type: 'Sale',
                        referenceNumber: o.orderNumber,
                        debit: Number(o.total) || 0,
                        credit: 0
                    });
                });

                const paymentWhere = {
                    partyType: 'customer',
                    [Op.or]: [{ partyId: customer.id }, { partyName: customer.name, partyId: null }],
                    paymentNumber: { [Op.notLike]: 'PAY-TOGGLE-%' }
                };
                if (db.payment.rawAttributes.isDeleted) paymentWhere.isDeleted = false;
                const payments = await db.payment.findAll({ where: paymentWhere });
                payments.forEach(p => {
                    transactions.push({
                        date: p.paymentDate,
                        type: 'Receipt',
                        referenceNumber: p.paymentNumber,
                        debit: 0,
                        credit: Number(p.amount) || 0
                    });
                });
            }

            // Chronological sort with real date parsing (dates are stored as
            // DD-MM-YYYY strings; new Date() cannot parse them).
            transactions.sort((a, b) => parseDate(a.date).valueOf() - parseDate(b.date).valueOf());

            // Running balance from the opening balance. Both party types:
            // what-they-owe(-us)/what-we-owe(-them) grows with debit for
            // customers and credit for suppliers.
            let balance = openingBalance;
            transactions.forEach(txn => {
                balance = partyType === 'supplier'
                    ? balance + txn.credit - txn.debit
                    : balance + txn.debit - txn.credit;
                txn.balance = Math.round(balance * 100) / 100;
            });

            return res.status(200).send({
                status: 200,
                message: 'party statement fetched successfully',
                data: { partyInfo, partyType, openingBalance, transactions, currentBalance: Math.round(balance * 100) / 100 }
            });

        } catch (error) {
            console.log(error);
            return res.status(500).send({ status: 500, message: error.message });
        }
    }
};
