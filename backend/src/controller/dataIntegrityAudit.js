/**
 * Data Integrity Audit Controller
 * 
 * Diagnoses and fixes corrupted order payment data.
 * 
 * An order's "paid" status is LEGITIMATE if ANY of these traces exist:
 *   1. Cash sale at creation (journal_batches has INVOICE_CASH)
 *   2. Human toggled it (audit_logs has ORDER_PAYMENT_STATUS entry)
 *   3. Receipt recorded (payments table has referenceId = orderId)
 *   4. Manual allocation (receipt_allocations with real user name)
 * 
 * If NONE of these exist → the software changed it without authorization = CORRUPTION.
 * 
 * ALL fixes require explicit user authorization — no automatic corrections.
 */
const db = require('../models');
const { createAuditLog } = require('../middleware/auditLogger');

module.exports = {
    /**
     * AUDIT: Scan orders for payment data corruption.
     * 
     * READ-ONLY — no data is modified.
     * 
     * For each "paid" order, checks 4 evidence sources to determine if
     * the status change was legitimate (human) or corrupted (software).
     * 
     * Query params:
     *   - customerId (optional): filter to a specific customer
     *   - onlyMismatches (optional, default true): only show corrupted orders
     *   - creditSalesOnly (optional, default false): only corrupted credit sales
     */
    auditOrders: async (req, res) => {
        try {
            const { customerId, onlyMismatches = 'true', creditSalesOnly = 'false' } = req.query;
            const showOnlyMismatches = onlyMismatches !== 'false';
            const showCreditSalesOnly = creditSalesOnly === 'true';

            const orderWhere = { isDeleted: false };
            if (customerId) orderWhere.customerId = customerId;

            // Batch 1: All orders
            const orders = await db.order.findAll({
                where: orderWhere,
                order: [['orderDate', 'DESC'], ['createdAt', 'DESC']],
                raw: true
            });

            if (orders.length === 0) {
                return res.status(200).json({
                    status: 200,
                    message: 'No orders found.',
                    data: { totalScanned: 0, totalMismatched: 0, creditSalesCorrupted: 0, orders: [] }
                });
            }

            const orderIds = orders.map(o => o.id);

            // Batch 2: Direct payments referencing these orders
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

            // Batch 3: Receipt allocations
            let allocationsByOrder = {};
            try {
                const allAllocations = await db.receiptAllocation.findAll({
                    where: { orderId: { [db.Sequelize.Op.in]: orderIds }, isDeleted: false },
                    raw: true
                });
                for (const a of allAllocations) {
                    if (!allocationsByOrder[a.orderId]) allocationsByOrder[a.orderId] = [];
                    allocationsByOrder[a.orderId].push(a);
                }
            } catch (e) { /* table might not exist */ }

            // Batch 4: Journal batches — INVOICE_CASH = was created as cash sale
            let cashSaleOrderIds = new Set();
            try {
                const cashJournals = await db.journalBatch.findAll({
                    where: {
                        referenceType: 'INVOICE_CASH',
                        referenceId: { [db.Sequelize.Op.in]: orderIds }
                    },
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

            // Batch 5: Audit logs — ORDER_PAYMENT_STATUS = human toggled via UI
            let toggledOrderIds = new Map(); // orderId -> { userName, createdAt }
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
                    // Keep only the most recent toggle per order
                    if (!toggledOrderIds.has(log.entityId)) {
                        toggledOrderIds.set(log.entityId, {
                            userName: log.userName,
                            action: log.description,
                            date: log.createdAt
                        });
                    }
                }
            } catch (e) { /* audit_logs might not exist */ }

            // Process in memory
            const results = [];
            let totalScanned = 0;
            let totalMismatched = 0;
            let creditSalesCorrupted = 0;

            for (const order of orders) {
                totalScanned++;

                const directPayments = paymentsByOrder[order.id] || [];
                const directPaymentTotal = directPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

                const allocations = allocationsByOrder[order.id] || [];
                const allocationTotal = allocations.reduce((s, a) => s + Number(a.amount || 0), 0);
                const hasSystemBackfill = allocations.some(a =>
                    a.allocatedByName === 'system-backfill' ||
                    (a.notes && a.notes.startsWith('Backfill FIFO:'))
                );

                const evidencePaid = Math.max(directPaymentTotal, allocationTotal);
                const orderTotal = Number(order.total) || 0;
                const storedPaid = Number(order.paidAmount) || 0;

                // What status SHOULD be based on evidence
                let correctStatus = 'unpaid';
                if (evidencePaid >= orderTotal && orderTotal > 0) correctStatus = 'paid';
                else if (evidencePaid > 0) correctStatus = 'partial';

                const correctDue = Math.max(0, orderTotal - evidencePaid);

                // Determine the source of "paid" status
                const wasCashSale = cashSaleOrderIds.has(order.id);
                const wasToggledByHuman = toggledOrderIds.has(order.id);
                const hasPaymentRecord = directPayments.length > 0;
                const hasManualAllocation = allocations.some(a =>
                    a.allocatedByName && a.allocatedByName !== 'system-backfill'
                );

                // An order is LEGITIMATELY paid if ANY human trace exists
                const hasLegitimateEvidence = wasCashSale || wasToggledByHuman || hasPaymentRecord || hasManualAllocation;

                // Mismatch: stored status doesn't match evidence
                const paidMismatch = Math.abs(storedPaid - evidencePaid) > 0.01;
                const statusMismatch = order.paymentStatus !== correctStatus;

                // For toggle case: if human toggled to paid, that IS the evidence
                // Don't flag it as mismatch
                const hasMismatch = (paidMismatch || statusMismatch) && !wasToggledByHuman;

                // Credit sale corrupted = marked paid, not cash sale, not toggled, no payment
                const isCreditSaleCorrupted = !wasCashSale
                    && !wasToggledByHuman
                    && !hasPaymentRecord
                    && !hasManualAllocation
                    && order.paymentStatus === 'paid'
                    && evidencePaid < orderTotal;

                if (isCreditSaleCorrupted) creditSalesCorrupted++;
                if (hasMismatch) totalMismatched++;

                // Determine "changed by" trail
                let changedBy = 'Unknown';
                if (wasCashSale) {
                    changedBy = 'Cash sale (at billing)';
                } else if (wasToggledByHuman) {
                    const toggle = toggledOrderIds.get(order.id);
                    changedBy = `Toggled by ${toggle.userName} on ${new Date(toggle.date).toLocaleDateString('en-IN')}`;
                } else if (hasPaymentRecord) {
                    const lastPayment = directPayments[directPayments.length - 1];
                    changedBy = `Receipt ${lastPayment.paymentNumber} (${new Date(lastPayment.createdAt).toLocaleDateString('en-IN')})`;
                } else if (hasManualAllocation) {
                    const manual = allocations.find(a => a.allocatedByName && a.allocatedByName !== 'system-backfill');
                    changedBy = `Allocated by ${manual.allocatedByName}`;
                } else if (hasSystemBackfill) {
                    changedBy = 'SOFTWARE (auto-FIFO) — unauthorized';
                } else if (order.paymentStatus === 'paid') {
                    changedBy = 'NO EVIDENCE — corrupted';
                } else {
                    changedBy = '—';
                }

                // Apply filters
                if (showCreditSalesOnly && !isCreditSaleCorrupted) continue;
                if (!showCreditSalesOnly && showOnlyMismatches && !hasMismatch && !isCreditSaleCorrupted) continue;

                results.push({
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    orderDate: order.orderDate,
                    customerName: order.customerName,
                    customerId: order.customerId,
                    orderTotal,
                    stored: {
                        paidAmount: storedPaid,
                        dueAmount: Number(order.dueAmount),
                        paymentStatus: order.paymentStatus
                    },
                    evidence: {
                        directPaymentTotal,
                        allocationTotal,
                        evidencePaid,
                        correctDue,
                        correctStatus
                    },
                    directPaymentCount: directPayments.length,
                    hasMismatch,
                    wasCashSale,
                    wasToggledByHuman,
                    hasPaymentRecord,
                    hasManualAllocation,
                    hasSystemBackfill,
                    isCreditSaleCorrupted,
                    changedBy
                });
            }

            return res.status(200).json({
                status: 200,
                message: showCreditSalesOnly
                    ? `Found ${creditSalesCorrupted} credit sale orders wrongly marked as paid without human authorization (out of ${totalScanned} total).`
                    : `Scanned ${totalScanned} orders. Found ${totalMismatched} mismatches + ${creditSalesCorrupted} corrupted credit sales.`,
                data: {
                    totalScanned,
                    totalMismatched,
                    creditSalesCorrupted,
                    orders: results
                }
            });

        } catch (error) {
            console.error('Audit orders error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * FIX selected orders: Reset paidAmount/dueAmount/paymentStatus
     * to match actual payment evidence.
     * 
     * Skips orders that were legitimately toggled by human (those have audit_log evidence).
     * 
     * Requires explicit user authorization (changedBy).
     */
    fixOrders: async (req, res) => {
        try {
            const { orderIds, changedBy } = req.body;

            if (!changedBy || !changedBy.trim()) {
                return res.status(400).json({ status: 400, message: 'changedBy (your name) is required for audit trail' });
            }

            const fixAll = !orderIds || orderIds.length === 0 || (orderIds.length === 1 && orderIds[0] === 'all');

            const orderWhere = { isDeleted: false };
            if (!fixAll) {
                orderWhere.id = { [db.Sequelize.Op.in]: orderIds };
            }

            const result = await db.sequelize.transaction(async (transaction) => {
                const orders = await db.order.findAll({
                    where: orderWhere,
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });

                const allOrderIds = orders.map(o => o.id);

                // Batch payments
                const paymentWhere = {
                    referenceType: 'order',
                    referenceId: { [db.Sequelize.Op.in]: allOrderIds },
                    partyType: 'customer'
                };
                if (db.payment.rawAttributes.isDeleted) paymentWhere.isDeleted = false;
                const allPayments = await db.payment.findAll({ where: paymentWhere, transaction, raw: true });
                const paymentsByOrder = {};
                for (const p of allPayments) {
                    if (!paymentsByOrder[p.referenceId]) paymentsByOrder[p.referenceId] = [];
                    paymentsByOrder[p.referenceId].push(p);
                }

                // Batch allocations
                let allocationsByOrder = {};
                try {
                    const allAllocations = await db.receiptAllocation.findAll({
                        where: { orderId: { [db.Sequelize.Op.in]: allOrderIds }, isDeleted: false },
                        transaction, raw: true
                    });
                    for (const a of allAllocations) {
                        if (!allocationsByOrder[a.orderId]) allocationsByOrder[a.orderId] = [];
                        allocationsByOrder[a.orderId].push(a);
                    }
                } catch (e) { /* table might not exist */ }

                // Batch: audit logs for toggle evidence (skip these orders)
                let toggledOrderIds = new Set();
                try {
                    const toggleLogs = await db.auditLog.findAll({
                        where: {
                            entityType: 'ORDER_PAYMENT_STATUS',
                            entityId: { [db.Sequelize.Op.in]: allOrderIds }
                        },
                        attributes: ['entityId'],
                        raw: true
                    });
                    toggledOrderIds = new Set(toggleLogs.map(l => l.entityId));
                } catch (e) { /* audit_logs might not exist */ }

                const fixed = [];
                const skipped = [];

                for (const order of orders) {
                    // SKIP orders that were toggled by human
                    if (toggledOrderIds.has(order.id)) {
                        skipped.push({
                            orderNumber: order.orderNumber,
                            reason: 'Toggled by human (audit log exists) — preserving'
                        });
                        continue;
                    }

                    const directPayments = paymentsByOrder[order.id] || [];
                    const directPaymentTotal = directPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

                    const allocations = allocationsByOrder[order.id] || [];
                    const allocationTotal = allocations.reduce((s, a) => s + Number(a.amount || 0), 0);

                    const evidencePaid = Math.max(directPaymentTotal, allocationTotal);
                    const orderTotal = Number(order.total) || 0;
                    const storedPaid = Number(order.paidAmount) || 0;

                    let correctStatus = 'unpaid';
                    if (evidencePaid >= orderTotal && orderTotal > 0) correctStatus = 'paid';
                    else if (evidencePaid > 0) correctStatus = 'partial';

                    const correctDue = Math.max(0, orderTotal - evidencePaid);

                    const paidMismatch = Math.abs(storedPaid - evidencePaid) > 0.01;
                    const statusMismatch = order.paymentStatus !== correctStatus;

                    if (paidMismatch || statusMismatch) {
                        await db.order.update({
                            paidAmount: evidencePaid,
                            dueAmount: correctDue,
                            paymentStatus: correctStatus
                        }, { where: { id: order.id }, transaction });

                        fixed.push({
                            orderNumber: order.orderNumber,
                            customerName: order.customerName,
                            before: {
                                paidAmount: storedPaid,
                                dueAmount: Number(order.dueAmount),
                                paymentStatus: order.paymentStatus
                            },
                            after: {
                                paidAmount: evidencePaid,
                                dueAmount: correctDue,
                                paymentStatus: correctStatus
                            }
                        });
                    }
                }

                return { fixed, skipped };
            });

            // Audit log
            await createAuditLog({
                userId: req.user?.id,
                userName: changedBy.trim(),
                userRole: req.user?.role || 'unknown',
                action: 'DATA_INTEGRITY_FIX',
                entityType: 'ORDER',
                entityId: fixAll ? 'all-mismatched' : orderIds.join(','),
                description: `${changedBy.trim()} fixed ${result.fixed.length} orders (skipped ${result.skipped.length} human-toggled orders)`,
                newValues: { fixedCount: result.fixed.length, skippedCount: result.skipped.length },
                ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                userAgent: req.headers['user-agent']
            });

            return res.status(200).json({
                status: 200,
                message: `Fixed ${result.fixed.length} orders. Skipped ${result.skipped.length} orders toggled by human (preserved).`,
                data: {
                    fixedCount: result.fixed.length,
                    skippedCount: result.skipped.length,
                    orders: result.fixed,
                    skipped: result.skipped
                }
            });

        } catch (error) {
            console.error('Fix orders error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    }
};
