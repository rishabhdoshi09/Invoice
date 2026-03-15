/**
 * Forensic Audit Controller
 * 
 * GOLDEN RULE (from the user):
 *   "Agar status change hua hai, to log hona hi chahiye. Log nahi hai to change system bug hai."
 *   (If a status changed, there MUST be a log. No log = system bug.)
 * 
 * This tool provides 3 forensic views:
 *   1. Financial Contradictions — status vs paidAmount/dueAmount mismatch
 *   2. Paid Without Evidence   — status='paid' but no cash journal, no toggle log, no payment
 *   3. Change Attribution      — who made the most paid/unpaid toggles (audit log forensics)
 * 
 * It does NOT auto-fix anything. User reviews and selects what to fix.
 */
const db = require('../models');
const { createAuditLog } = require('../middleware/auditLogger');

module.exports = {
    /**
     * GET /api/data-audit/forensic
     * Read-only forensic scan. Returns categorized findings.
     */
    forensicScan: async (req, res) => {
        try {
            const customerId = req.query?.customerId;

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
                    data: {
                        totalScanned: 0,
                        contradictions: [],
                        paidWithoutEvidence: [],
                        changeAttribution: [],
                        summary: {}
                    }
                });
            }

            const orderIds = orders.map(o => o.id);

            // === BATCH LOAD ALL EVIDENCE ===

            // 1. Cash sale journals (INVOICE_CASH)
            let cashSaleOrderIds = new Set();
            try {
                const cj = await db.journalBatch.findAll({
                    where: {
                        referenceType: 'INVOICE_CASH',
                        referenceId: { [db.Sequelize.Op.in]: orderIds }
                    },
                    attributes: ['referenceId'],
                    raw: true
                });
                cashSaleOrderIds = new Set(cj.map(j => j.referenceId));
            } catch (e) {
                // Fallback: check ledger entries for cash debit
                try {
                    const cashLedger = await db.ledger.findOne({
                        where: { name: 'Cash Account' },
                        raw: true
                    });
                    if (cashLedger) {
                        const ce = await db.ledgerEntry.findAll({
                            where: {
                                ledgerId: cashLedger.id,
                                referenceType: 'order',
                                referenceId: { [db.Sequelize.Op.in]: orderIds },
                                debit: { [db.Sequelize.Op.gt]: 0 }
                            },
                            attributes: ['referenceId'],
                            raw: true
                        });
                        cashSaleOrderIds = new Set(ce.map(e => e.referenceId));
                    }
                } catch (e2) { /* silent */ }
            }

            // 2. ALL toggle audit logs per order (not just the latest)
            const allToggles = new Map(); // orderId -> [{ newStatus, userName, date }]
            const latestToggle = new Map(); // orderId -> latest toggle
            try {
                const tl = await db.auditLog.findAll({
                    where: {
                        entityType: 'ORDER_PAYMENT_STATUS',
                        entityId: { [db.Sequelize.Op.in]: orderIds }
                    },
                    order: [['createdAt', 'DESC']],
                    raw: true
                });
                for (const log of tl) {
                    let newStatus = null;
                    let oldStatus = null;
                    try {
                        const nv = typeof log.newValues === 'string' ? JSON.parse(log.newValues) : log.newValues;
                        newStatus = nv?.paymentStatus || null;
                    } catch (e) { /* silent */ }
                    try {
                        const ov = typeof log.oldValues === 'string' ? JSON.parse(log.oldValues) : log.oldValues;
                        oldStatus = ov?.paymentStatus || null;
                    } catch (e) { /* silent */ }
                    if (!newStatus && log.description) {
                        const m = log.description.match(/from\s+(\w+)\s+to\s+(\w+)/i);
                        if (m) {
                            oldStatus = m[1].toLowerCase();
                            newStatus = m[2].toLowerCase();
                        }
                    }
                    const entry = {
                        newStatus,
                        oldStatus,
                        userName: log.userName,
                        date: log.createdAt,
                        description: log.description
                    };
                    if (!allToggles.has(log.entityId)) {
                        allToggles.set(log.entityId, []);
                    }
                    allToggles.get(log.entityId).push(entry);
                    if (!latestToggle.has(log.entityId)) {
                        latestToggle.set(log.entityId, entry);
                    }
                }
            } catch (e) { /* silent */ }

            // 3. Direct payments per order
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

            // 4. System/reconstruct audit logs (evidence of tool-based changes)
            let systemChangedOrders = new Set();
            try {
                const systemLogs = await db.auditLog.findAll({
                    where: {
                        entityType: {
                            [db.Sequelize.Op.in]: ['ORDER', 'RECONSTRUCT_ORDER_STATES']
                        },
                        [db.Sequelize.Op.or]: [
                            { description: { [db.Sequelize.Op.iLike]: '%reconstruct%' } },
                            { description: { [db.Sequelize.Op.iLike]: '%system%' } },
                            { description: { [db.Sequelize.Op.iLike]: '%backfill%' } },
                            { description: { [db.Sequelize.Op.iLike]: '%auto%' } }
                        ]
                    },
                    raw: true
                });
                for (const log of systemLogs) {
                    if (log.entityId) systemChangedOrders.add(log.entityId);
                }
            } catch (e) { /* silent */ }

            // === CATEGORIZE FINDINGS ===

            const contradictions = [];
            const paidWithoutEvidence = [];

            for (const order of orders) {
                const total = Number(order.total) || 0;
                const paidAmount = Number(order.paidAmount) || 0;
                const dueAmount = Number(order.dueAmount) || 0;
                const status = order.paymentStatus;

                // --- CATEGORY 1: Financial Contradictions ---
                // Status says one thing, amounts say another
                let contradiction = null;

                if (status === 'paid' && total > 0 && paidAmount < total * 0.99) {
                    contradiction = {
                        type: 'STATUS_AMOUNT_MISMATCH',
                        detail: `Status is "paid" but paidAmount (${paidAmount.toFixed(2)}) < total (${total.toFixed(2)})`
                    };
                } else if (status === 'unpaid' && paidAmount > total * 0.01) {
                    contradiction = {
                        type: 'STATUS_AMOUNT_MISMATCH',
                        detail: `Status is "unpaid" but paidAmount (${paidAmount.toFixed(2)}) > 0`
                    };
                } else if (total > 0 && Math.abs(paidAmount + dueAmount - total) > 0.50) {
                    contradiction = {
                        type: 'AMOUNTS_DONT_ADD_UP',
                        detail: `paidAmount (${paidAmount.toFixed(2)}) + dueAmount (${dueAmount.toFixed(2)}) != total (${total.toFixed(2)})`
                    };
                }

                if (contradiction) {
                    contradictions.push({
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        orderDate: order.orderDate,
                        customerName: order.customerName,
                        total,
                        paidAmount,
                        dueAmount,
                        paymentStatus: status,
                        issue: contradiction,
                        hasToggleLog: allToggles.has(order.id),
                        hasCashJournal: cashSaleOrderIds.has(order.id),
                        hasPaymentRecord: !!(paymentsByOrder[order.id]?.length),
                        wasSystemModified: systemChangedOrders.has(order.id)
                    });
                }

                // --- CATEGORY 2: Paid Without Evidence ---
                // Status is 'paid', amounts look correct, but NO evidence of HOW it became paid
                if (status === 'paid' && total > 0 && paidAmount >= total * 0.99) {
                    const hasCashJournal = cashSaleOrderIds.has(order.id);
                    const hasToggle = latestToggle.has(order.id) &&
                        latestToggle.get(order.id).newStatus === 'paid';
                    const hasPayment = !!(paymentsByOrder[order.id]?.length);
                    const hasSystemMark = systemChangedOrders.has(order.id);

                    if (!hasCashJournal && !hasToggle && !hasPayment) {
                        // No evidence at all — could be old cash sale OR corruption
                        paidWithoutEvidence.push({
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                            orderDate: order.orderDate,
                            customerName: order.customerName,
                            total,
                            paidAmount,
                            paymentStatus: status,
                            createdAt: order.createdAt,
                            modifiedByName: order.modifiedByName || null,
                            wasSystemModified: hasSystemMark,
                            note: hasSystemMark
                                ? 'System/tool modified this order — likely needs review'
                                : 'No evidence found — could be legitimate old cash sale OR corruption'
                        });
                    }
                }
            }

            // === CATEGORY 3: Change Attribution (Top Changers) ===
            let changeAttribution = [];
            try {
                const [results] = await db.sequelize.query(`
                    SELECT
                        "userName",
                        COUNT(*) as total_changes,
                        COUNT(*) FILTER (WHERE "newValues"->>'paymentStatus' = 'paid') as to_paid,
                        COUNT(*) FILTER (WHERE "newValues"->>'paymentStatus' = 'unpaid') as to_unpaid,
                        MIN("createdAt") as first_change,
                        MAX("createdAt") as last_change
                    FROM audit_logs
                    WHERE "entityType" = 'ORDER_PAYMENT_STATUS'
                    GROUP BY "userName"
                    ORDER BY total_changes DESC
                `);
                changeAttribution = results.map(r => ({
                    userName: r.userName,
                    totalChanges: Number(r.total_changes),
                    toPaid: Number(r.to_paid),
                    toUnpaid: Number(r.to_unpaid),
                    firstChange: r.first_change,
                    lastChange: r.last_change
                }));
            } catch (e) {
                console.error('Change attribution query failed:', e.message);
            }

            // === SUMMARY ===
            const summary = {
                totalScanned: orders.length,
                totalPaid: orders.filter(o => o.paymentStatus === 'paid').length,
                totalUnpaid: orders.filter(o => o.paymentStatus === 'unpaid').length,
                totalPartial: orders.filter(o => o.paymentStatus === 'partial').length,
                contradictionCount: contradictions.length,
                paidWithoutEvidenceCount: paidWithoutEvidence.length,
                ordersWithToggleLogs: allToggles.size,
                ordersWithCashJournal: cashSaleOrderIds.size,
                ordersWithPayments: Object.keys(paymentsByOrder).length
            };

            return res.status(200).json({
                status: 200,
                message: `Forensic scan complete. ${contradictions.length} contradictions, ${paidWithoutEvidence.length} paid-without-evidence.`,
                data: {
                    summary,
                    contradictions,
                    paidWithoutEvidence,
                    changeAttribution
                }
            });

        } catch (error) {
            console.error('Forensic scan error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * POST /api/data-audit/fix
     * Fix specific orders selected by user.
     * Body: { orderIds: [...], action: 'reset_to_unpaid' | 'reset_to_paid', changedBy: 'name' }
     */
    fixSelectedOrders: async (req, res) => {
        try {
            const { orderIds, action, changedBy } = req.body;

            if (!changedBy || !changedBy.trim()) {
                return res.status(400).json({ status: 400, message: 'changedBy is required for audit trail' });
            }
            if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
                return res.status(400).json({ status: 400, message: 'orderIds array is required' });
            }
            if (!['reset_to_unpaid', 'reset_to_paid'].includes(action)) {
                return res.status(400).json({ status: 400, message: 'action must be "reset_to_unpaid" or "reset_to_paid"' });
            }

            const orders = await db.order.findAll({
                where: { id: { [db.Sequelize.Op.in]: orderIds }, isDeleted: false },
                raw: true
            });

            if (orders.length === 0) {
                return res.status(404).json({ status: 404, message: 'No matching orders found' });
            }

            const results = [];
            const changedByTrimmed = changedBy.trim();

            await db.sequelize.transaction(async (transaction) => {
                for (const order of orders) {
                    const total = Number(order.total) || 0;
                    const oldStatus = order.paymentStatus;
                    const oldPaid = Number(order.paidAmount) || 0;

                    let newStatus, newPaid, newDue;

                    if (action === 'reset_to_unpaid') {
                        newStatus = 'unpaid';
                        newPaid = 0;
                        newDue = total;
                    } else {
                        newStatus = 'paid';
                        newPaid = total;
                        newDue = 0;
                    }

                    await db.order.update(
                        { paymentStatus: newStatus, paidAmount: newPaid, dueAmount: newDue },
                        { where: { id: order.id }, transaction }
                    );

                    // Create audit log for EVERY fix
                    await createAuditLog({
                        userId: req.user?.id,
                        userName: changedByTrimmed,
                        userRole: req.user?.role || 'unknown',
                        action: 'UPDATE',
                        entityType: 'ORDER_PAYMENT_STATUS',
                        entityId: order.id,
                        entityName: order.orderNumber,
                        oldValues: { paymentStatus: oldStatus, paidAmount: oldPaid },
                        newValues: {
                            paymentStatus: newStatus,
                            paidAmount: newPaid,
                            changedBy: changedByTrimmed,
                            source: 'forensic-audit-fix'
                        },
                        description: `${changedByTrimmed} fixed ${order.orderNumber}: ${oldStatus} → ${newStatus} (via Forensic Audit tool)`,
                        ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                        userAgent: req.headers['user-agent']
                    });

                    results.push({
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        customerName: order.customerName,
                        before: { paymentStatus: oldStatus, paidAmount: oldPaid },
                        after: { paymentStatus: newStatus, paidAmount: newPaid, dueAmount: newDue }
                    });
                }
            });

            return res.status(200).json({
                status: 200,
                message: `Fixed ${results.length} orders. Every change logged in audit trail.`,
                data: { totalFixed: results.length, orders: results }
            });

        } catch (error) {
            console.error('Fix orders error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * GET /api/data-audit/reconstruct (backward compat — same as forensicScan)
     * POST /api/data-audit/reconstruct (backward compat — same as fixSelectedOrders)
     */
    reconstructOrders: async (req, res) => {
        if (req.method === 'GET') {
            return module.exports.forensicScan(req, res);
        }
        return module.exports.fixSelectedOrders(req, res);
    }
};
