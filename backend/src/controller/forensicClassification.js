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
    pay_agg AS (
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
            COALESCE(pa.pay_total, 0)   AS pay_total,
            COALESCE(pa.pay_count, 0)   AS pay_count,
            CASE
                WHEN COALESCE(aa.alloc_total, 0) >= o.total AND o.total > 0 THEN 'RECEIPT_PAID'
                WHEN COALESCE(aa.alloc_total, 0) > 0 AND COALESCE(aa.alloc_total, 0) < o.total AND o.total > 0 THEN 'PARTIAL_PAID'
                WHEN o."paymentStatus" IN ('unpaid','partial')
                     AND COALESCE(aa.alloc_total, 0) = 0 AND COALESCE(pa.pay_total, 0) = 0 THEN 'CREDIT_UNPAID'
                WHEN o."paymentStatus" = 'paid' AND COALESCE(pa.pay_total, 0) > 0 THEN 'PAYMENT_PAID'
                WHEN o."paymentStatus" = 'paid'
                     AND COALESCE(aa.alloc_total, 0) = 0
                     AND COALESCE(pa.pay_total, 0) = 0 THEN 'NEEDS_AUDIT_CHECK'
                ELSE 'OTHER'
            END AS pre_class
        FROM orders o
        LEFT JOIN alloc_agg aa ON aa."orderId" = o.id
        LEFT JOIN pay_agg pa ON pa."referenceId" = o.id
        WHERE o."isDeleted" = false
    ),
    needs_check AS (
        SELECT id AS uid, id::text AS eid FROM base WHERE pre_class = 'NEEDS_AUDIT_CHECK'
    ),
    toggle_counts AS (
        SELECT "entityId", COUNT(*) AS cnt
        FROM audit_logs
        WHERE "entityType" = 'ORDER_PAYMENT_STATUS'
          AND "entityId" IN (SELECT eid FROM needs_check)
        GROUP BY "entityId"
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
        WHERE "referenceType" IN ('INVOICE', 'INVOICE_CASH')
          AND "referenceId" IN (SELECT uid FROM needs_check)
        GROUP BY "referenceId"
    )
    SELECT
        b.*,
        COALESCE(tc.cnt, 0) AS toggle_log_count,
        CASE
            WHEN b.pre_class != 'NEEDS_AUDIT_CHECK' THEN b.pre_class
            WHEN COALESCE(tc.cnt, 0) > 0 THEN 'TOGGLED_PAID'
            WHEN cs.created_as = 'paid' THEN 'CASH_SALE'
            WHEN COALESCE(je.jb_count, 0) > 0 THEN 'CASH_SALE'
            WHEN b.total > 0 THEN 'SUSPICIOUS_PAID'
            ELSE 'OTHER'
        END AS classification
    FROM base b
    LEFT JOIN toggle_counts tc ON tc."entityId" = b.id::text
    LEFT JOIN create_status cs ON cs."entityId" = b.id::text
    LEFT JOIN journal_evidence je ON je.ref_id = b.id
`;

/**
 * For each order, determine what the correct values SHOULD be based on evidence.
 * Then compare to stored values. Any mismatch = needs repair.
 */
function computeExpectedValues(row) {
    const cat = row.classification;
    const total = Number(row.total);
    const allocTotal = Number(row.alloc_total);
    const payTotal = Number(row.pay_total);
    const storedPaid = Number(row.paidAmount);
    const storedDue = Number(row.dueAmount);
    const storedStatus = row.paymentStatus;

    let expectedPaid, expectedDue, expectedStatus, repairAction;

    if (cat === 'RECEIPT_PAID') {
        // Ground truth: receipt allocations say fully paid
        expectedPaid = Math.min(allocTotal, total);
        expectedDue = Math.max(0, total - expectedPaid);
        expectedStatus = 'paid';
        repairAction = 'FIX_FROM_RECEIPTS';
    } else if (cat === 'PARTIAL_PAID') {
        // Ground truth: receipt allocations say partially paid
        expectedPaid = Math.min(allocTotal, total);
        expectedDue = Math.max(0, total - expectedPaid);
        expectedStatus = 'partial';
        repairAction = 'FIX_FROM_RECEIPTS';
    } else if (cat === 'PAYMENT_PAID') {
        // Has payment records — recalculate from payment total
        expectedPaid = Math.min(payTotal, total);
        expectedDue = Math.max(0, total - expectedPaid);
        if (expectedPaid >= total) expectedStatus = 'paid';
        else if (expectedPaid > 0) expectedStatus = 'partial';
        else expectedStatus = 'unpaid';
        repairAction = 'FIX_FROM_PAYMENTS';
    } else if (cat === 'SUSPICIOUS_PAID') {
        // Paid with ZERO evidence — reset to unpaid
        expectedPaid = 0;
        expectedDue = total;
        expectedStatus = 'unpaid';
        repairAction = 'RESET_TO_UNPAID';
    } else {
        // TOGGLED_PAID, CASH_SALE, CREDIT_UNPAID, OTHER — trust current values
        expectedPaid = storedPaid;
        expectedDue = storedDue;
        expectedStatus = storedStatus;
        repairAction = null;
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
                SUSPICIOUS_PAID: { count: 0, totalValue: 0, needsRepair: 0 },
                TOGGLED_PAID: { count: 0, totalValue: 0, needsRepair: 0 },
                PAYMENT_PAID: { count: 0, totalValue: 0, needsRepair: 0 },
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
    }
};
