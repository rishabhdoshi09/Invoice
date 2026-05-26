const { authenticate } = require('../middleware/auth');
const db = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');

module.exports = (router) => {
    /**
     * GET /api/activity/today?date=YYYY-MM-DD
     * Returns all creates and deletes for the given day (default: today).
     */
    router.get('/activity/today', authenticate, async (req, res) => {
        try {
            const date = req.query.date
                ? moment(req.query.date, 'YYYY-MM-DD')
                : moment();

            const dayStart = date.clone().startOf('day').toDate();
            const dayEnd   = date.clone().endOf('day').toDate();
            const ddmmyyyy = date.format('DD-MM-YYYY');
            const yyyymmdd = date.format('YYYY-MM-DD');

            // ── Live data for creates ────────────────────────────────────────
            const [orders, payments, customers, suppliers, purchases] = await Promise.all([
                // Orders/invoices created today
                db.order.findAll({
                    where: {
                        isDeleted: false,
                        createdAt: { [Op.between]: [dayStart, dayEnd] }
                    },
                    attributes: ['id', 'orderNumber', 'orderDate', 'customerName', 'total', 'paidAmount', 'createdAt'],
                    order: [['createdAt', 'DESC']]
                }),

                // Payments created today (customer + supplier)
                db.payment.findAll({
                    where: {
                        isDeleted: false,
                        createdAt: { [Op.between]: [dayStart, dayEnd] }
                    },
                    attributes: ['id', 'paymentNumber', 'paymentDate', 'partyName', 'partyType', 'amount', 'referenceNumber', 'notes', 'createdAt'],
                    order: [['createdAt', 'DESC']]
                }),

                // Customers created today (no isDeleted column in this table)
                db.customer.findAll({
                    where: {
                        createdAt: { [Op.between]: [dayStart, dayEnd] }
                    },
                    attributes: ['id', 'name', 'mobile', 'openingBalance', 'createdAt'],
                    order: [['createdAt', 'DESC']]
                }),

                // Suppliers created today (no isDeleted column in this table)
                db.supplier.findAll({
                    where: {
                        createdAt: { [Op.between]: [dayStart, dayEnd] }
                    },
                    attributes: ['id', 'name', 'mobile', 'openingBalance', 'createdAt'],
                    order: [['createdAt', 'DESC']]
                }),

                // Purchase bills created today
                db.purchaseBill.findAll({
                    where: {
                        isDeleted: false,
                        createdAt: { [Op.between]: [dayStart, dayEnd] }
                    },
                    include: [{ model: db.supplier, attributes: ['name'], required: false }],
                    attributes: ['id', 'billNumber', 'billDate', 'supplierId', 'total', 'paidAmount', 'createdAt'],
                    order: [['createdAt', 'DESC']]
                })
            ]);

            // ── Deleted entries from audit_logs ──────────────────────────────
            const deletions = await db.auditLog.findAll({
                where: {
                    action: 'DELETE',
                    entityType: { [Op.in]: ['ORDER', 'PAYMENT', 'CUSTOMER', 'SUPPLIER', 'PURCHASE'] },
                    createdAt: { [Op.between]: [dayStart, dayEnd] }
                },
                order: [['createdAt', 'DESC']]
            });

            // ── Build unified activity feed ──────────────────────────────────
            const feed = [];

            orders.forEach(o => feed.push({
                id: `order-${o.id}`, time: o.createdAt, action: 'CREATE', entityType: 'ORDER',
                title: `Invoice ${o.orderNumber}`,
                subtitle: o.customerName,
                amount: Number(o.total),
                meta: `Date: ${o.orderDate}`
            }));

            payments.forEach(p => feed.push({
                id: `payment-${p.id}`, time: p.createdAt, action: 'CREATE',
                entityType: p.partyType === 'customer' ? 'PAYMENT_IN' : 'PAYMENT_OUT',
                title: `Payment ${p.paymentNumber}`,
                subtitle: p.partyName,
                amount: Number(p.amount),
                meta: p.referenceNumber || p.notes || ''
            }));

            customers.forEach(c => feed.push({
                id: `customer-${c.id}`, time: c.createdAt, action: 'CREATE', entityType: 'CUSTOMER',
                title: `New Customer: ${c.name}`,
                subtitle: c.mobile || '',
                amount: Number(c.openingBalance) || 0,
                meta: c.openingBalance ? `Opening: ₹${Number(c.openingBalance).toLocaleString('en-IN')}` : ''
            }));

            suppliers.forEach(s => feed.push({
                id: `supplier-${s.id}`, time: s.createdAt, action: 'CREATE', entityType: 'SUPPLIER',
                title: `New Supplier: ${s.name}`,
                subtitle: s.mobile || '',
                amount: Number(s.openingBalance) || 0,
                meta: s.openingBalance ? `Opening: ₹${Number(s.openingBalance).toLocaleString('en-IN')}` : ''
            }));

            purchases.forEach(p => feed.push({
                id: `purchase-${p.id}`, time: p.createdAt, action: 'CREATE', entityType: 'PURCHASE',
                title: `Purchase ${p.billNumber}`,
                subtitle: p.supplier?.name || '',
                amount: Number(p.total),
                meta: `Date: ${p.billDate}`
            }));

            deletions.forEach(d => {
                const old = d.oldValues || {};
                feed.push({
                    id: `del-${d.id}`, time: d.createdAt, action: 'DELETE', entityType: d.entityType,
                    title: `Deleted ${d.entityType}: ${d.entityName || old.orderNumber || old.paymentNumber || old.billNumber || old.name || d.entityId}`,
                    subtitle: old.customerName || old.partyName || old.name || '',
                    amount: Number(old.total || old.amount || old.grandTotal || 0),
                    meta: `By: ${d.userName || '—'} (${d.userRole || '—'})`,
                    deletedBy: d.userName
                });
            });

            // Sort by time descending
            feed.sort((a, b) => new Date(b.time) - new Date(a.time));

            // ── Summary ──────────────────────────────────────────────────────
            const totalSales      = orders.reduce((s, o) => s + Number(o.total), 0);
            const paymentsIn      = payments.filter(p => p.partyType === 'customer').reduce((s, p) => s + Number(p.amount), 0);
            const paymentsOut     = payments.filter(p => p.partyType === 'supplier').reduce((s, p) => s + Number(p.amount), 0);
            const totalPurchases  = purchases.reduce((s, p) => s + Number(p.total), 0);

            res.json({
                status: 200,
                data: {
                    date: date.format('DD-MM-YYYY'),
                    feed,
                    summary: {
                        totalSales,
                        paymentsIn,
                        paymentsOut,
                        totalPurchases,
                        newCustomers: customers.length,
                        newSuppliers: suppliers.length,
                        deletions: deletions.length
                    }
                }
            });
        } catch (err) {
            console.error('[ACTIVITY]', err);
            res.status(500).json({ status: 500, message: err.message });
        }
    });
};
