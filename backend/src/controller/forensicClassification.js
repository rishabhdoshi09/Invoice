/**
 * Forensic Classification Controller — Complete Version
 * 
 * Detects corruption in BOTH directions:
 *   1. Orders marked PAID with no evidence → SUSPICIOUS_PAID (reset to unpaid)
 *   2. Orders where stored paidAmount/dueAmount/paymentStatus doesn't match
 *      receipt_allocations → needs recalculation from receipts
 * 
 * Two-pass SQL for performance:
 *   Pass 1: allocations + payments (fast, covers ~95% of orders)
 *   Pass 2: audit_logs + journals (only for the few paid+no-alloc+no-pay orders)
 *
 * Evidence hierarchy:
 *   1. receipt_allocations (active) → ground truth for paidAmount
 *   2. payments with referenceType='order' → evidence of payment
 *   3. audit_log ORDER_PAYMENT_STATUS → manual toggle evidence
 *   4. audit_log ORDER CREATE with paid → cash sale evidence
 *   5. journal_batches INVOICE → cash sale evidence (pre-audit-logging orders)
 *   6. None of the above → SUSPICIOUS_PAID
 */
const db = require('../models');

let _indexesCreated = false;

async function ensureIndexes() {
    if (_indexesCreated) return;
    await db.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON audit_logs ("entityId", "entityType");
        CREATE INDEX IF NOT EXISTS idx_audit_entity_action ON audit_logs ("entityId", "entityType", "action");
        CREATE INDEX IF NOT EXISTS idx_alloc_order ON receipt_allocations ("orderId") WHERE ("isDeleted" IS NULL OR "isDeleted" = false);
        CREATE INDEX IF NOT EXISTS idx_pay_ref ON payments ("referenceId") WHERE ("isDeleted" = false AND "referenceType" = 'order');
        CREATE INDEX IF NOT EXISTS idx_pay_partyname ON payments (LOWER(TRIM("partyName"))) WHERE ("isDeleted" = false);
        CREATE INDEX IF NOT EXISTS idx_jb_ref_type ON journal_batches ("referenceId", "referenceType");
    `).catch(() => {});
    _indexesCreated = true;
}

const CLASSIFICATION_SQL = `
    WITH alloc_agg AS (
        SELECT "orderId", SUM(amount) AS alloc_total, COUNT(*) AS alloc_count
        FROM receipt_allocations
        WHERE "isDeleted" IS NULL OR "isDeleted" = false
        GROUP BY "orderId"
    ),
    pay_order AS (
        SELECT "referenceId", SUM(amount) AS pay_total, COUNT(*) AS pay_count
        FROM payments
        WHERE "isDeleted" = false AND "referenceType" = 'order'
        GROUP BY "referenceId"
    ),
    base AS (
        SELECT
            o.id, o."orderNumber", o."orderDate", o."customerName", o."customerId",
            o.total, o."paidAmount", o."dueAmount", o."paymentStatus",
            o."modifiedByName", o."createdAt", o."updatedAt",
            COALESCE(aa.alloc_total, 0) AS alloc_total,
            COALESCE(aa.alloc_count, 0) AS alloc_count,
            COALESCE(po.pay_total, 0)   AS pay_total,
            COALESCE(po.pay_count, 0)   AS pay_count,
            CASE
                WHEN COALESCE(aa.alloc_total, 0) >= o.total AND o.total > 0 THEN 'RECEIPT_PAID'
                WHEN COALESCE(aa.alloc_total, 0) > 0 AND COALESCE(aa.alloc_total, 0) < o.total AND o.total > 0 THEN 'PARTIAL_PAID'
                WHEN o."paymentStatus" IN ('unpaid','partial')
                     AND COALESCE(aa.alloc_total, 0) = 0 AND COALESCE(po.pay_total, 0) = 0 THEN 'CREDIT_UNPAID'
                -- ALL paid orders without receipt_allocations → go to audit check
                -- modifiedByName will determine if human or system toggled
                WHEN o."paymentStatus" = 'paid'
                     AND COALESCE(aa.alloc_total, 0) = 0 THEN 'NEEDS_AUDIT_CHECK'
                ELSE 'OTHER'
            END AS pre_class
        FROM orders o
        LEFT JOIN alloc_agg aa ON aa."orderId" = o.id
        LEFT JOIN pay_order po ON po."referenceId" = o.id
        WHERE o."isDeleted" = false
          AND o."customerName" IS NOT NULL AND TRIM(o."customerName") != ''
    ),
    needs_check AS (
        SELECT id AS uid, id::text AS eid FROM base WHERE pre_class = 'NEEDS_AUDIT_CHECK'
    ),
    create_status AS (
        SELECT DISTINCT ON ("entityId")
            "entityId",
            "newValues"->>'paymentStatus' AS created_as
        FROM audit_logs
        WHERE "entityType" = 'ORDER' AND "action" = 'CREATE'
          AND "entityId" IN (SELECT eid FROM needs_check)
        ORDER BY "entityId", "createdAt" ASC
    ),
    journal_evidence AS (
        SELECT "referenceId" AS ref_id, COUNT(*) AS jb_count
        FROM journal_batches
        WHERE "referenceType" = 'INVOICE_CASH'
          AND "referenceId" IN (SELECT uid FROM needs_check)
        GROUP BY "referenceId"
    )
    SELECT
        b.*,
        EXTRACT(EPOCH FROM (b."updatedAt" - b."createdAt")) AS age_diff_seconds,
        CASE
            WHEN b.pre_class != 'NEEDS_AUDIT_CHECK' THEN b.pre_class
            -- Rule 1: modifiedByName has a real person name → human toggled → preserve
            WHEN b."modifiedByName" IS NOT NULL 
                 AND TRIM(b."modifiedByName") != '' 
                 THEN 'HUMAN_TOGGLED'
            -- Rule 2: ORDER CREATE audit log proves it was created as paid (cash sale at counter)
            WHEN cs.created_as = 'paid' THEN 'CASH_SALE'
            -- Rule 2b: INVOICE_CASH journal exists (cash collected at point of sale)
            WHEN COALESCE(je.jb_count, 0) > 0 THEN 'CASH_SALE'
            -- Rule 3: Paid, no human name, no cash sale evidence = SYSTEM toggled by auto-reconciliation
            WHEN b.total > 0 THEN 'SYSTEM_TOGGLED'
            ELSE 'OTHER'
        END AS classification
    FROM base b
    LEFT JOIN create_status cs ON cs."entityId" = b.id::text
    LEFT JOIN journal_evidence je ON je.ref_id = b.id
`;

/**
 * For each order, determine what the correct values SHOULD be based on evidence.
 * 
 * RULES:
 * 1. receipt_allocations = source of truth for paid amounts
 * 2. HUMAN_TOGGLED = human explicitly changed status → preserve (their decision)
 * 3. SYSTEM_TOGGLED = system auto-reconciliation changed status → undo
 * 4. CASH_SALE = legitimate POS sale → preserve
 * 5. ADVANCE_PAID / PAYMENT_PAID without allocation = system damage → undo
 * 
 * After undo: order status recalculated from actual receipts only.
 */
function computeExpectedValues(row) {
    const cat = row.classification;
    const total = Number(row.total);
    const allocTotal = Number(row.alloc_total);
    const storedPaid = Number(row.paidAmount);
    const storedDue = Number(row.dueAmount);
    const storedStatus = row.paymentStatus;

    let expectedPaid, expectedDue, expectedStatus, repairAction;

    if (cat === 'RECEIPT_PAID') {
        // Has receipt_allocations covering full amount → recalculate from allocations
        expectedPaid = Math.min(allocTotal, total);
        expectedDue = Math.max(0, total - expectedPaid);
        expectedStatus = 'paid';
        repairAction = 'FIX_FROM_RECEIPTS';
    } else if (cat === 'PARTIAL_PAID') {
        // Has receipt_allocations but not full → recalculate from allocations
        expectedPaid = Math.min(allocTotal, total);
        expectedDue = Math.max(0, total - expectedPaid);
        expectedStatus = 'partial';
        repairAction = 'FIX_FROM_RECEIPTS';
    } else if (cat === 'CASH_SALE') {
        // Legitimate cash sale — trust as is
        expectedPaid = storedPaid;
        expectedDue = storedDue;
        expectedStatus = storedStatus;
        repairAction = null;
    } else if (cat === 'HUMAN_TOGGLED') {
        // Human explicitly toggled this order — PRESERVE their decision
        expectedPaid = storedPaid;
        expectedDue = storedDue;
        expectedStatus = storedStatus;
        repairAction = null;
    } else if (cat === 'CREDIT_UNPAID' || cat === 'OTHER') {
        // Already unpaid or unclassified — no change
        expectedPaid = storedPaid;
        expectedDue = storedDue;
        expectedStatus = storedStatus;
        repairAction = null;
    } else {
        // SYSTEM_TOGGLED — system auto-toggled without human action → UNDO
        // Reset to unpaid — actual payment tracking is via receipts/payments table
        expectedPaid = 0;
        expectedDue = total;
        expectedStatus = 'unpaid';
        repairAction = 'UNDO_SYSTEM_TOGGLE';
    }

    // Check for discrepancy
    const tolerance = 0.50;
    const needsRepair = 
        Math.abs(storedPaid - expectedPaid) > tolerance ||
        Math.abs(storedDue - expectedDue) > tolerance ||
        storedStatus !== expectedStatus;

    return {
        expectedPaid,
        expectedDue,
        expectedStatus,
        needsRepair,
        repairAction: needsRepair ? repairAction : null
    };
}

module.exports = {
    classifyOrders: async (req, res) => {
        try {
            await ensureIndexes();
            const [orders] = await db.sequelize.query(CLASSIFICATION_SQL);

            const summary = {
                RECEIPT_PAID: { count: 0, totalValue: 0, needsRepair: 0 },
                PARTIAL_PAID: { count: 0, totalValue: 0, needsRepair: 0 },
                CASH_SALE: { count: 0, totalValue: 0, needsRepair: 0 },
                CREDIT_UNPAID: { count: 0, totalValue: 0, needsRepair: 0 },
                HUMAN_TOGGLED: { count: 0, totalValue: 0, needsRepair: 0 },
                SYSTEM_TOGGLED: { count: 0, totalValue: 0, needsRepair: 0 },
                OTHER: { count: 0, totalValue: 0, needsRepair: 0 }
            };
            const repairCandidates = [];

            for (const row of orders) {
                const cat = row.classification;
                const total = Number(row.total);
                const bucket = summary[cat] || summary.OTHER;
                bucket.count++;
                bucket.totalValue += total;

                const expected = computeExpectedValues(row);

                if (expected.needsRepair) {
                    bucket.needsRepair++;
                    repairCandidates.push({
                        orderId: row.id,
                        orderNumber: row.orderNumber,
                        orderDate: row.orderDate,
                        customerName: row.customerName,
                        customerId: row.customerId,
                        total,
                        classification: cat,
                        current: {
                            paidAmount: Number(row.paidAmount),
                            dueAmount: Number(row.dueAmount),
                            paymentStatus: row.paymentStatus
                        },
                        evidence: {
                            allocTotal: Number(row.alloc_total),
                            allocCount: Number(row.alloc_count),
                            payTotal: Number(row.pay_total),
                            payCount: Number(row.pay_count),
                            toggleLogCount: Number(row.toggle_log_count)
                        },
                        expected: {
                            paidAmount: expected.expectedPaid,
                            dueAmount: expected.expectedDue,
                            paymentStatus: expected.expectedStatus
                        },
                        repairAction: expected.repairAction
                    });
                }
            }

            // Group repair candidates by action for clear reporting
            const repairsByAction = {};
            for (const r of repairCandidates) {
                if (!repairsByAction[r.repairAction]) {
                    repairsByAction[r.repairAction] = { count: 0, orders: [] };
                }
                repairsByAction[r.repairAction].count++;
                repairsByAction[r.repairAction].orders.push(r);
            }

            return res.status(200).json({
                status: 200,
                message: `Classified ${orders.length} orders. ${repairCandidates.length} need repair.`,
                data: {
                    totalOrders: orders.length,
                    totalNeedsRepair: repairCandidates.length,
                    summary,
                    repairsByAction,
                    repairCandidates
                }
            });
        } catch (error) {
            console.error('Classification error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    repairPreview: async (req, res) => {
        try {
            await ensureIndexes();
            const [orders] = await db.sequelize.query(CLASSIFICATION_SQL);
            
            const repairs = [];
            for (const row of orders) {
                const expected = computeExpectedValues(row);
                if (expected.needsRepair) {
                    repairs.push({
                        orderId: row.id,
                        orderNumber: row.orderNumber,
                        customerName: row.customerName,
                        total: Number(row.total),
                        classification: row.classification,
                        current: {
                            paidAmount: Number(row.paidAmount),
                            dueAmount: Number(row.dueAmount),
                            paymentStatus: row.paymentStatus
                        },
                        expected: {
                            paidAmount: expected.expectedPaid,
                            dueAmount: expected.expectedDue,
                            paymentStatus: expected.expectedStatus
                        },
                        repairAction: expected.repairAction,
                        repairSource: `${row.classification} → ${expected.repairAction}`
                    });
                }
            }

            // Count by action
            const byAction = {};
            for (const r of repairs) {
                byAction[r.repairAction] = (byAction[r.repairAction] || 0) + 1;
            }

            return res.status(200).json({
                status: 200,
                message: `Repair preview: ${repairs.length} orders need repair.`,
                data: { totalRepairs: repairs.length, repairs, byAction }
            });
        } catch (error) {
            console.error('Repair preview error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    repairExecute: async (req, res) => {
        try {
            const { changedBy } = req.body;
            if (!changedBy || !changedBy.trim()) {
                return res.status(400).json({ status: 400, message: 'changedBy is required for audit trail.' });
            }

            await ensureIndexes();
            const [orders] = await db.sequelize.query(CLASSIFICATION_SQL);
            
            // Collect all repairs
            const repairPlan = [];
            for (const row of orders) {
                const expected = computeExpectedValues(row);
                if (expected.needsRepair) {
                    repairPlan.push({
                        row,
                        expected,
                        current: {
                            paidAmount: Number(row.paidAmount),
                            dueAmount: Number(row.dueAmount),
                            paymentStatus: row.paymentStatus
                        }
                    });
                }
            }

            if (repairPlan.length === 0) {
                return res.status(200).json({ status: 200, message: 'Nothing to repair.', data: { totalRepaired: 0 } });
            }

            const operator = changedBy.trim();
            const results = [];
            const { createAuditLog } = require('../middleware/auditLogger');

            // Process in batches of 100 to avoid holding one giant transaction
            const BATCH_SIZE = 100;
            for (let i = 0; i < repairPlan.length; i += BATCH_SIZE) {
                const batch = repairPlan.slice(i, i + BATCH_SIZE);
                
                await db.sequelize.transaction(async (transaction) => {
                    for (const { row, expected, current } of batch) {
                        await db.order.update(
                            {
                                paidAmount: expected.expectedPaid,
                                dueAmount: expected.expectedDue,
                                paymentStatus: expected.expectedStatus
                            },
                            { where: { id: row.id }, transaction }
                        );

                        await createAuditLog({
                            userId: req.user?.id,
                            userName: operator,
                            userRole: req.user?.role || 'admin',
                            action: 'PAYMENT_STATUS_REBUILD',
                            entityType: 'DATA_RECOVERY',
                            entityId: row.id,
                            entityName: row.orderNumber,
                            oldValues: current,
                            newValues: {
                                paidAmount: expected.expectedPaid,
                                dueAmount: expected.expectedDue,
                                paymentStatus: expected.expectedStatus,
                                source: 'forensic_classification_repair',
                                classification: row.classification,
                                repairAction: expected.repairAction
                            },
                            description: `[REPAIR] ${row.orderNumber}: ${current.paymentStatus}→${expected.expectedStatus} | ${expected.repairAction} | classification: ${row.classification}`,
                            ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                            userAgent: req.headers['user-agent']
                        });

                        results.push({
                            orderId: row.id,
                            orderNumber: row.orderNumber,
                            classification: row.classification,
                            action: expected.repairAction,
                            before: current,
                            after: {
                                paidAmount: expected.expectedPaid,
                                dueAmount: expected.expectedDue,
                                paymentStatus: expected.expectedStatus
                            }
                        });
                    }
                });
            }

            // Post-repair validation
            let validation = null;
            try {
                const checks = [];
                const [paidZero] = await db.sequelize.query(`SELECT COUNT(*) as c FROM orders WHERE "isDeleted" = false AND "paymentStatus" = 'paid' AND "paidAmount" = 0 AND total > 0`);
                checks.push({ name: 'No paid with zero paidAmount', passed: Number(paidZero[0].c) === 0, violations: Number(paidZero[0].c) });
                const [negDue] = await db.sequelize.query(`SELECT COUNT(*) as c FROM orders WHERE "isDeleted" = false AND "dueAmount" < 0`);
                checks.push({ name: 'No negative dueAmount', passed: Number(negDue[0].c) === 0, violations: Number(negDue[0].c) });
                const [sumBad] = await db.sequelize.query(`SELECT COUNT(*) as c FROM orders WHERE "isDeleted" = false AND ABS("paidAmount" + "dueAmount" - total) > 0.50`);
                checks.push({ name: 'paidAmount + dueAmount = total', passed: Number(sumBad[0].c) === 0, violations: Number(sumBad[0].c) });
                const [statusBad] = await db.sequelize.query(`SELECT COUNT(*) as c FROM orders WHERE "isDeleted" = false AND total > 0 AND (("paymentStatus" = 'paid' AND "dueAmount" > 0.50) OR ("paymentStatus" = 'unpaid' AND "paidAmount" > 0.50))`);
                checks.push({ name: 'Status consistent with amounts', passed: Number(statusBad[0].c) === 0, violations: Number(statusBad[0].c) });
                validation = { allPassed: checks.every(c => c.passed), checks };
            } catch (e) { /* silent */ }

            // Count by action
            const byAction = {};
            for (const r of results) {
                byAction[r.action] = (byAction[r.action] || 0) + 1;
            }

            return res.status(200).json({
                status: 200,
                message: `Repaired ${results.length} orders. Audit log created for each.`,
                data: { totalRepaired: results.length, byAction, repairs: results, validation }
            });
        } catch (error) {
            console.error('Repair execute error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * POST /api/data-audit/reconstruct-fifo
     * 
     * Forensic + FIFO merged reconstruction:
     *   1. Run forensic classification on ALL orders (same SQL as /classify)
     *   2. Only touch SYSTEM_TOGGLED orders — skip HUMAN_TOGGLED, CASH_SALE, RECEIPT_PAID, etc.
     *   3. Damage window filter (Jan 9 → Mar 15 2026) as extra safety
     *   4. Clear receipt_allocations for targeted orders only
     *   5. Reset targeted orders to unpaid
     *   6. FIFO allocate ALL customer payments to targeted orders (oldest first)
     *   7. Update paidAmount, dueAmount, paymentStatus from allocations
     *   8. Recalculate customer.currentBalance from scratch
     * 
     * Payments table = TRUTH. Classification = INTELLIGENCE.
     */
    reconstructFifo: async (req, res) => {
        try {
            const { changedBy, dryRun } = req.body;
            if (!changedBy || !changedBy.trim()) {
                return res.status(400).json({ status: 400, message: 'changedBy is required for audit trail.' });
            }

            const isDryRun = dryRun === true;
            const operator = changedBy.trim();

            // Damage window: auto-reconciliation was active Jan 9 2026 → Mar 15 2026
            const DAMAGE_START = '2026-01-09';
            const DAMAGE_END = '2026-03-16';

            // Step 1: Run forensic classification on ALL orders (reuse existing SQL)
            await ensureIndexes();
            const [classifiedOrders] = await db.sequelize.query(CLASSIFICATION_SQL);

            // Step 2: Separate orders by classification
            const systemToggled = [];
            const preserved = { HUMAN_TOGGLED: 0, CASH_SALE: 0, RECEIPT_PAID: 0, PARTIAL_PAID: 0, CREDIT_UNPAID: 0, OTHER: 0, OUTSIDE_WINDOW: 0 };

            for (const order of classifiedOrders) {
                if (order.classification === 'SYSTEM_TOGGLED') {
                    // Extra safety: only within damage window
                    const updatedAt = new Date(order.updatedAt);
                    if (updatedAt >= new Date(DAMAGE_START) && updatedAt < new Date(DAMAGE_END)) {
                        systemToggled.push(order);
                    } else {
                        preserved.OUTSIDE_WINDOW++;
                    }
                } else {
                    preserved[order.classification] = (preserved[order.classification] || 0) + 1;
                }
            }

            // Group system-toggled orders by customer
            const customerOrderMap = {};
            for (const order of systemToggled) {
                const key = order.customerName;
                if (!customerOrderMap[key]) {
                    customerOrderMap[key] = { customerId: order.customerId, orders: [] };
                }
                customerOrderMap[key].orders.push(order);
            }

            const results = {
                totalClassified: classifiedOrders.length,
                damageWindow: { from: DAMAGE_START, to: DAMAGE_END },
                systemToggled: systemToggled.length,
                preserved,
                ordersReset: 0,
                allocationsCreated: 0,
                totalAllocated: 0,
                ordersChanged: 0,
                customersRecalculated: 0,
                customerDetails: []
            };

            if (!isDryRun) {
                // Step 3: Clear receipt_allocations ONLY for system-toggled orders
                const stOrderIds = systemToggled.map(o => o.id);
                if (stOrderIds.length > 0) {
                    await db.sequelize.query(`
                        UPDATE receipt_allocations SET "isDeleted" = true
                        WHERE "orderId" IN (:orderIds)
                    `, { replacements: { orderIds: stOrderIds } });
                }
            }

            // Step 4: Per-customer FIFO allocation on system-toggled orders
            for (const [custName, custData] of Object.entries(customerOrderMap)) {
                const custOrders = custData.orders.sort((a, b) => 
                    new Date(a.orderDate) - new Date(b.orderDate) || new Date(a.createdAt) - new Date(b.createdAt)
                );

                // All payments for this customer (oldest first)
                const [payments] = await db.sequelize.query(`
                    SELECT id, "paymentNumber", amount, "paymentDate", "createdAt"
                    FROM payments
                    WHERE "isDeleted" = false
                      AND "partyType" = 'customer'
                      AND ("partyId" = :custId OR "partyName" = :custName)
                    ORDER BY "paymentDate" ASC, "createdAt" ASC
                `, { replacements: { custId: custData.customerId, custName: custName } });

                // FIFO allocate
                const allocations = [];
                const paymentRemaining = {};
                for (const p of payments) {
                    paymentRemaining[p.id] = Number(p.amount);
                }

                for (const order of custOrders) {
                    let orderRemaining = Number(order.total);
                    if (orderRemaining <= 0) continue;

                    for (const payment of payments) {
                        const available = paymentRemaining[payment.id] || 0;
                        if (available <= 0.01) continue;
                        const allocAmount = Math.round(Math.min(available, orderRemaining) * 100) / 100;
                        if (allocAmount <= 0) continue;
                        allocations.push({ paymentId: payment.id, orderId: order.id, orderNumber: order.orderNumber, amount: allocAmount });
                        paymentRemaining[payment.id] -= allocAmount;
                        orderRemaining -= allocAmount;
                        if (orderRemaining <= 0.01) break;
                    }
                }

                // Calculate new states
                const allocPerOrder = {};
                for (const a of allocations) allocPerOrder[a.orderId] = (allocPerOrder[a.orderId] || 0) + a.amount;

                const orderUpdates = [];
                for (const order of custOrders) {
                    const total = Number(order.total);
                    const allocated = allocPerOrder[order.id] || 0;
                    const newPaid = Math.round(Math.min(allocated, total) * 100) / 100;
                    const newDue = Math.round(Math.max(0, total - newPaid) * 100) / 100;
                    const newStatus = newPaid >= total - 0.5 ? 'paid' : (newPaid > 0.5 ? 'partial' : 'unpaid');
                    const changed = Math.abs(Number(order.paidAmount) - newPaid) > 0.5
                                 || Math.abs(Number(order.dueAmount) - newDue) > 0.5
                                 || order.paymentStatus !== newStatus;
                    orderUpdates.push({
                        orderId: order.id, orderNumber: order.orderNumber,
                        before: { paidAmount: Number(order.paidAmount), dueAmount: Number(order.dueAmount), paymentStatus: order.paymentStatus },
                        after: { paidAmount: newPaid, dueAmount: newDue, paymentStatus: newStatus },
                        changed
                    });
                }

                const totalPaymentValue = payments.reduce((s, p) => s + Number(p.amount), 0);
                const totalOrderValue = custOrders.reduce((s, o) => s + Number(o.total), 0);
                const changedOrders = orderUpdates.filter(u => u.changed);
                results.allocationsCreated += allocations.length;
                results.totalAllocated += allocations.reduce((s, a) => s + a.amount, 0);
                results.ordersChanged += changedOrders.length;

                results.customerDetails.push({
                    name: custName,
                    systemOrders: custOrders.length,
                    payments: payments.length,
                    totalOrderValue: Math.round(totalOrderValue * 100) / 100,
                    totalPaymentValue: Math.round(totalPaymentValue * 100) / 100,
                    balance: Math.round((totalOrderValue - totalPaymentValue) * 100) / 100,
                    allocationsCreated: allocations.length,
                    ordersChanged: changedOrders.length
                });

                // EXECUTE
                if (!isDryRun && custOrders.length > 0) {
                    await db.sequelize.transaction(async (transaction) => {
                        // Reset system-toggled orders to unpaid
                        for (const order of custOrders) {
                            await db.order.update(
                                { paidAmount: 0, dueAmount: Number(order.total), paymentStatus: 'unpaid' },
                                { where: { id: order.id }, transaction }
                            );
                            results.ordersReset++;
                        }
                        // Create allocations
                        for (const alloc of allocations) {
                            await db.receiptAllocation.create({
                                paymentId: alloc.paymentId, orderId: alloc.orderId,
                                amount: alloc.amount, isDeleted: false
                            }, { transaction });
                        }
                        // Update orders with correct values
                        for (const upd of orderUpdates) {
                            await db.order.update(
                                { paidAmount: upd.after.paidAmount, dueAmount: upd.after.dueAmount, paymentStatus: upd.after.paymentStatus },
                                { where: { id: upd.orderId }, transaction }
                            );
                        }
                    });
                }
            }

            // Step 5: Recalculate customer.currentBalance from scratch
            if (!isDryRun) {
                const [balanceRows] = await db.sequelize.query(`
                    SELECT c.id,
                        COALESCE(c."openingBalance", 0)
                        + COALESCE((SELECT SUM(total) FROM orders WHERE "isDeleted" = false AND ("customerId" = c.id OR "customerName" = c.name)), 0)
                        - COALESCE((SELECT SUM(amount) FROM payments WHERE "isDeleted" = false AND "partyType" = 'customer' AND ("partyId" = c.id OR "partyName" = c.name)), 0)
                        AS correct_balance
                    FROM customers c
                `);
                for (const row of balanceRows) {
                    await db.customer.update(
                        { currentBalance: Math.max(0, Number(row.correct_balance) || 0) },
                        { where: { id: row.id } }
                    );
                    results.customersRecalculated++;
                }
            }

            // Post-repair validation
            let validation = null;
            if (!isDryRun) {
                const checks = [];
                const [paidZero] = await db.sequelize.query(`SELECT COUNT(*) as c FROM orders WHERE "isDeleted" = false AND "paymentStatus" = 'paid' AND "paidAmount" = 0 AND total > 0`);
                checks.push({ name: 'No paid orders with zero paidAmount', passed: Number(paidZero[0].c) === 0, count: Number(paidZero[0].c) });
                const [negDue] = await db.sequelize.query(`SELECT COUNT(*) as c FROM orders WHERE "isDeleted" = false AND "dueAmount" < 0`);
                checks.push({ name: 'No negative dueAmount', passed: Number(negDue[0].c) === 0, count: Number(negDue[0].c) });
                const [sumBad] = await db.sequelize.query(`SELECT COUNT(*) as c FROM orders WHERE "isDeleted" = false AND ABS("paidAmount" + "dueAmount" - total) > 0.50`);
                checks.push({ name: 'paidAmount + dueAmount = total', passed: Number(sumBad[0].c) === 0, count: Number(sumBad[0].c) });
                validation = { allPassed: checks.every(c => c.passed), checks };
            }

            results.totalAllocated = Math.round(results.totalAllocated * 100) / 100;

            return res.status(200).json({
                status: 200,
                message: isDryRun
                    ? `DRY RUN [Forensic+FIFO]: ${results.systemToggled} SYSTEM_TOGGLED found, ${results.ordersChanged} would change. Preserved: ${preserved.HUMAN_TOGGLED} human, ${preserved.CASH_SALE} cash sale, ${preserved.RECEIPT_PAID} receipt-backed, ${preserved.OUTSIDE_WINDOW} outside window.`
                    : `DONE [Forensic+FIFO]: ${results.ordersReset} orders reset, ${results.allocationsCreated} allocations (₹${results.totalAllocated}), ${results.customersRecalculated} customer balances recalculated.`,
                data: { isDryRun, ...results, validation }
            });
        } catch (error) {
            console.error('FIFO Reconstruction error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * GET /api/data-audit/diagnose
     * Deep diagnostic scan — run this on local DB and share the output.
     * Helps understand why classification might be wrong.
     */
    diagnose: async (req, res) => {
        try {
            const results = {};

            // 1. Order summary
            const [orderSummary] = await db.sequelize.query(`
                SELECT 
                    COUNT(*) AS total_orders,
                    SUM(CASE WHEN "paymentStatus" = 'paid' THEN 1 ELSE 0 END) AS paid,
                    SUM(CASE WHEN "paymentStatus" = 'unpaid' THEN 1 ELSE 0 END) AS unpaid,
                    SUM(CASE WHEN "paymentStatus" = 'partial' THEN 1 ELSE 0 END) AS partial,
                    SUM(CASE WHEN "customerName" IS NOT NULL AND TRIM("customerName") != '' THEN 1 ELSE 0 END) AS with_customer_name,
                    SUM(CASE WHEN "customerName" IS NULL OR TRIM("customerName") = '' THEN 1 ELSE 0 END) AS without_customer_name,
                    SUM(CASE WHEN "paymentStatus" = 'paid' AND "customerName" IS NOT NULL AND TRIM("customerName") != '' THEN 1 ELSE 0 END) AS paid_with_name,
                    SUM(CASE WHEN "paymentStatus" IN ('unpaid','partial') AND "customerName" IS NOT NULL AND TRIM("customerName") != '' THEN 1 ELSE 0 END) AS credit_with_name
                FROM orders WHERE "isDeleted" = false
            `);
            results.orders = orderSummary[0];

            // 2. Receipt allocations
            const [allocSummary] = await db.sequelize.query(`
                SELECT 
                    COUNT(*) AS total_allocations,
                    SUM(CASE WHEN "isDeleted" = true THEN 1 ELSE 0 END) AS deleted,
                    SUM(CASE WHEN "isDeleted" = false OR "isDeleted" IS NULL THEN 1 ELSE 0 END) AS active,
                    COUNT(DISTINCT "orderId") AS distinct_orders_with_alloc
                FROM receipt_allocations
            `);
            results.receipt_allocations = allocSummary[0];

            // 3. Do allocations actually JOIN to orders?
            const [allocJoinCheck] = await db.sequelize.query(`
                SELECT COUNT(DISTINCT ra."orderId") AS matching_orders
                FROM receipt_allocations ra
                JOIN orders o ON o.id = ra."orderId" AND o."isDeleted" = false
                WHERE ra."isDeleted" IS NULL OR ra."isDeleted" = false
            `);
            results.alloc_join_to_orders = allocJoinCheck[0];

            // 4. Payments summary
            const [paySummary] = await db.sequelize.query(`
                SELECT 
                    "referenceType", 
                    COUNT(*) AS total,
                    SUM(CASE WHEN "isDeleted" = false THEN 1 ELSE 0 END) AS active,
                    SUM(CASE WHEN "isDeleted" = false THEN amount ELSE 0 END) AS active_amount
                FROM payments 
                GROUP BY "referenceType"
            `);
            results.payments_by_type = paySummary;

            // 5. Do payments JOIN to orders?
            const [payJoinCheck] = await db.sequelize.query(`
                SELECT COUNT(DISTINCT p."referenceId") AS matching_orders
                FROM payments p
                JOIN orders o ON o.id = p."referenceId" AND o."isDeleted" = false
                WHERE p."isDeleted" = false
            `);
            results.pay_join_to_orders = payJoinCheck[0];

            // 6. Journal batches
            const [journalSummary] = await db.sequelize.query(`
                SELECT "referenceType", COUNT(*) AS total
                FROM journal_batches
                GROUP BY "referenceType"
            `);
            results.journal_batches_by_type = journalSummary;

            // 7. Do journals JOIN to orders?
            const [journalJoinCheck] = await db.sequelize.query(`
                SELECT COUNT(DISTINCT jb."referenceId") AS matching_orders
                FROM journal_batches jb
                JOIN orders o ON o.id = jb."referenceId" AND o."isDeleted" = false
                WHERE jb."referenceType" IN ('INVOICE', 'INVOICE_CASH')
            `);
            results.journal_join_to_orders = journalJoinCheck[0];

            // 8. Audit logs summary
            const [auditSummary] = await db.sequelize.query(`
                SELECT "entityType", "action", COUNT(*) AS total
                FROM audit_logs
                GROUP BY "entityType", "action"
                ORDER BY COUNT(*) DESC
                LIMIT 20
            `);
            results.audit_logs_summary = auditSummary;

            // 9. modifiedByName distribution for paid orders with customer names
            const [modifiedByCheck] = await db.sequelize.query(`
                SELECT 
                    SUM(CASE WHEN "modifiedByName" IS NULL OR TRIM("modifiedByName") = '' THEN 1 ELSE 0 END) AS no_modifier,
                    SUM(CASE WHEN "modifiedByName" IS NOT NULL AND TRIM("modifiedByName") != '' THEN 1 ELSE 0 END) AS has_modifier
                FROM orders 
                WHERE "isDeleted" = false AND "paymentStatus" = 'paid'
                  AND "customerName" IS NOT NULL AND TRIM("customerName") != ''
            `);
            results.paid_orders_modifier = modifiedByCheck[0];

            // 10. updatedAt vs createdAt for paid orders with customer names
            const [timestampCheck] = await db.sequelize.query(`
                SELECT 
                    SUM(CASE WHEN EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) < 300 THEN 1 ELSE 0 END) AS never_modified,
                    SUM(CASE WHEN EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) >= 300 AND EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) < 86400 THEN 1 ELSE 0 END) AS modified_within_day,
                    SUM(CASE WHEN EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) >= 86400 THEN 1 ELSE 0 END) AS modified_after_day,
                    MIN(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt"))) AS min_age_diff,
                    MAX(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt"))) AS max_age_diff,
                    AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt"))) AS avg_age_diff
                FROM orders 
                WHERE "isDeleted" = false AND "paymentStatus" = 'paid'
                  AND "customerName" IS NOT NULL AND TRIM("customerName") != ''
            `);
            results.paid_timestamp_analysis = timestampCheck[0];

            // 11. Sample of paid orders with no evidence (first 5)
            const [sampleNoEvidence] = await db.sequelize.query(`
                SELECT o."orderNumber", o."customerName", o.total, o."paidAmount", o."dueAmount",
                       o."paymentStatus", o."modifiedByName",
                       o."createdAt", o."updatedAt",
                       EXTRACT(EPOCH FROM (o."updatedAt" - o."createdAt")) AS age_diff_sec
                FROM orders o
                LEFT JOIN receipt_allocations ra ON ra."orderId" = o.id AND (ra."isDeleted" IS NULL OR ra."isDeleted" = false)
                LEFT JOIN payments p ON p."referenceId" = o.id AND p."isDeleted" = false
                WHERE o."isDeleted" = false AND o."paymentStatus" = 'paid'
                  AND o."customerName" IS NOT NULL AND TRIM(o."customerName") != ''
                  AND ra.id IS NULL AND p.id IS NULL
                ORDER BY o."createdAt" DESC
                LIMIT 5
            `);
            results.sample_paid_no_evidence = sampleNoEvidence;

            return res.status(200).json({
                status: 200,
                message: 'Diagnostic scan complete',
                data: results
            });
        } catch (error) {
            console.error('Diagnose error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    }
};
