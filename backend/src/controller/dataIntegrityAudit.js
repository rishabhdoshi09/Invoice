/**
 * Data Integrity Audit Controller — SURGICAL VERSION
 * 
 * Reconstructs each order's correct paidAmount/paymentStatus from hard evidence.
 * 
 * Priority (highest first):
 *   1. Most recent audit_log toggle (entityType = ORDER_PAYMENT_STATUS)
 *      → the user's deliberate action wins over everything
 *   2. Cash sale at creation (journal_batches INVOICE_CASH)
 *      → it was always paid, set paidAmount = total
 *   3. Direct payment (payments table with referenceId = orderId)
 *      → paidAmount = sum of those payments
 *   4. Default → unpaid (credit sale with no evidence of payment)
 * 
 * PREVIEW first, then APPLY only with user authorization.
 */
const db = require('../models');
const { createAuditLog } = require('../middleware/auditLogger');

module.exports = {
    /**
     * RECONSTRUCT: Compute each order's correct state from evidence.
     * 
     * If preview=true (GET request), shows what would change without modifying.
     * If preview=false (POST with changedBy), applies the reconstruction.
     * 
     * Query params (GET):
     *   - customerId (optional): filter to specific customer
     */
    reconstructOrders: async (req, res) => {
        try {
            const isPreview = req.method === 'GET';
            const customerId = req.query?.customerId;
            const changedBy = req.body?.changedBy;

            if (!isPreview && (!changedBy || !changedBy.trim())) {
                return res.status(400).json({ status: 400, message: 'changedBy is required' });
            }

            const orderWhere = { isDeleted: false };
            if (customerId) orderWhere.customerId = customerId;

            const orders = await db.order.findAll({
                where: orderWhere,
                order: [['orderDate', 'DESC'], ['createdAt', 'DESC']],
                raw: true
            });

            if (orders.length === 0) {
                return res.status(200).json({
                    status: 200,
                    message: 'No orders found.',
                    data: { totalScanned: 0, totalChanged: 0, orders: [] }
                });
            }

            const orderIds = orders.map(o => o.id);

            // === BATCH LOAD ALL EVIDENCE ===

            // Evidence 1: Cash sale journals
            let cashSaleOrderIds = new Set();
            try {
                const cashJournals = await db.journalBatch.findAll({
                    where: { referenceType: 'INVOICE_CASH', referenceId: { [db.Sequelize.Op.in]: orderIds } },
                    attributes: ['referenceId'],
                    raw: true
                });
                cashSaleOrderIds = new Set(cashJournals.map(j => j.referenceId));
            } catch (e) {
                // Fallback: check old ledger entries
                try {
                    const cashLedger = await db.ledger.findOne({ where: { name: 'Cash Account' }, raw: true });
                    if (cashLedger) {
                        const cashEntries = await db.ledgerEntry.findAll({
                            where: {
                                ledgerId: cashLedger.id,
                                referenceType: 'order',
                                referenceId: { [db.Sequelize.Op.in]: orderIds },
                                debit: { [db.Sequelize.Op.gt]: 0 }
                            },
                            attributes: ['referenceId'],
                            raw: true
                        });
                        cashSaleOrderIds = new Set(cashEntries.map(e => e.referenceId));
                    }
                } catch (e2) { /* no fallback */ }
            }

            // Evidence 2: Most recent toggle per order from audit_logs
            // We want the LAST toggle action for each order
            let togglesByOrder = new Map(); // orderId -> { newStatus, userName, date }
            try {
                const toggleLogs = await db.auditLog.findAll({
                    where: {
                        entityType: 'ORDER_PAYMENT_STATUS',
                        entityId: { [db.Sequelize.Op.in]: orderIds }
                    },
                    order: [['createdAt', 'DESC']],
                    raw: true
                });
                for (const log of toggleLogs) {
                    // Keep only the MOST RECENT toggle per order
                    if (!togglesByOrder.has(log.entityId)) {
                        let newStatus = null;
                        // Extract the status from newValues
                        try {
                            const nv = typeof log.newValues === 'string' ? JSON.parse(log.newValues) : log.newValues;
                            newStatus = nv?.paymentStatus || null;
                        } catch (e) { /* parse error */ }

                        // Fallback: parse from description like "toggled INV/xxx from unpaid to paid"
                        if (!newStatus && log.description) {
                            const match = log.description.match(/to\s+(paid|unpaid|partial)/i);
                            if (match) newStatus = match[1].toLowerCase();
                        }

                        if (newStatus) {
                            togglesByOrder.set(log.entityId, {
                                newStatus,
                                userName: log.userName,
                                date: log.createdAt
                            });
                        }
                    }
                }
            } catch (e) { /* audit_logs might not exist */ }

            // Evidence 3: Direct payments per order
            const paymentWhere = {
                referenceType: 'order',
                referenceId: { [db.Sequelize.Op.in]: orderIds },
                partyType: 'customer'
            };
            if (db.payment.rawAttributes.isDeleted) paymentWhere.isDeleted = false;
            const allPayments = await db.payment.findAll({ where: paymentWhere, raw: true });
            const paymentsByOrder = {};
            for (const p of allPayments) {
                if (!paymentsByOrder[p.referenceId]) paymentsByOrder[p.referenceId] = [];
                paymentsByOrder[p.referenceId].push(p);
            }

            // === RECONSTRUCT EACH ORDER ===
            const results = [];
            let totalChanged = 0;

            for (const order of orders) {
                const orderTotal = Number(order.total) || 0;
                const currentPaid = Number(order.paidAmount) || 0;
                const currentStatus = order.paymentStatus;

                let correctPaid = 0;
                let correctStatus = 'unpaid';
                let correctDue = orderTotal;
                let reason = 'Default: credit sale, no payment evidence';

                // Priority 4 (lowest): Default = unpaid
                // Already set above

                // Priority 3: Direct payments
                const directPayments = paymentsByOrder[order.id] || [];
                if (directPayments.length > 0) {
                    const paymentTotal = directPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
                    correctPaid = Math.min(paymentTotal, orderTotal);
                    correctDue = Math.max(0, orderTotal - correctPaid);
                    if (correctPaid >= orderTotal) correctStatus = 'paid';
                    else if (correctPaid > 0) correctStatus = 'partial';
                    else correctStatus = 'unpaid';
                    const payNums = directPayments.map(p => p.paymentNumber).join(', ');
                    reason = `Direct payment(s): ${payNums} = ₹${correctPaid.toFixed(2)}`;
                }

                // Priority 2: Cash sale
                if (cashSaleOrderIds.has(order.id)) {
                    correctPaid = orderTotal;
                    correctDue = 0;
                    correctStatus = 'paid';
                    reason = 'Cash sale (INVOICE_CASH journal)';
                }

                // Priority 1 (highest): User toggle from audit_log
                if (togglesByOrder.has(order.id)) {
                    const toggle = togglesByOrder.get(order.id);
                    correctStatus = toggle.newStatus;
                    if (toggle.newStatus === 'paid') {
                        correctPaid = orderTotal;
                        correctDue = 0;
                    } else if (toggle.newStatus === 'unpaid') {
                        correctPaid = 0;
                        correctDue = orderTotal;
                    }
                    // partial stays as computed from payments
                    reason = `Toggled to "${toggle.newStatus}" by ${toggle.userName} on ${new Date(toggle.date).toLocaleDateString('en-IN')}`;
                }

                // Check if anything changed
                const paidChanged = Math.abs(currentPaid - correctPaid) > 0.01;
                const statusChanged = currentStatus !== correctStatus;
                const hasChange = paidChanged || statusChanged;

                if (hasChange) totalChanged++;

                results.push({
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    orderDate: order.orderDate,
                    customerName: order.customerName,
                    orderTotal,
                    current: { paidAmount: currentPaid, paymentStatus: currentStatus },
                    correct: { paidAmount: correctPaid, dueAmount: correctDue, paymentStatus: correctStatus },
                    reason,
                    hasChange
                });
            }

            // Filter to only changed orders for display
            const changedOrders = results.filter(r => r.hasChange);

            if (isPreview) {
                return res.status(200).json({
                    status: 200,
                    message: `Scanned ${orders.length} orders. ${totalChanged} need correction.`,
                    data: {
                        totalScanned: orders.length,
                        totalChanged,
                        orders: changedOrders
                    }
                });
            }

            // === APPLY ===
            if (!isPreview) {
                await db.sequelize.transaction(async (transaction) => {
                    for (const r of changedOrders) {
                        await db.order.update({
                            paidAmount: r.correct.paidAmount,
                            dueAmount: r.correct.dueAmount,
                            paymentStatus: r.correct.paymentStatus
                        }, { where: { id: r.orderId }, transaction });
                    }
                });

                await createAuditLog({
                    userId: req.user?.id,
                    userName: changedBy.trim(),
                    userRole: req.user?.role || 'unknown',
                    action: 'RECONSTRUCT_ORDER_STATES',
                    entityType: 'ORDER',
                    entityId: 'surgical-reconstruct',
                    description: `${changedBy.trim()} reconstructed ${totalChanged} orders from evidence (cash journals + audit toggles + direct payments)`,
                    newValues: { totalChanged },
                    ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                    userAgent: req.headers['user-agent']
                });
            }

            return res.status(200).json({
                status: 200,
                message: `Reconstructed ${totalChanged} orders from evidence.`,
                data: {
                    totalScanned: orders.length,
                    totalChanged,
                    orders: changedOrders
                }
            });

        } catch (error) {
            console.error('Reconstruct error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    }
};
