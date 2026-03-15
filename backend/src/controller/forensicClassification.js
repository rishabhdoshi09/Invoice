/**
 * Forensic Classification Controller
 * 
 * Two-pass classification for maximum performance:
 *   Pass 1: Classify orders using ONLY allocations + payments (fast, indexed).
 *           This resolves RECEIPT_PAID, PARTIAL_PAID, CREDIT_UNPAID instantly.
 *   Pass 2: Only for paid orders with no allocations → check audit_logs.
 *           This resolves TOGGLED_PAID, CASH_SALE, SUSPICIOUS_PAID.
 *
 * audit_logs is the slowest table. This approach only scans it for the
 * small subset of orders that actually need evidence checking.
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
    -- Pass 1: classify without audit_logs
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
                WHEN o."paymentStatus" IN ('unpaid','partial') AND COALESCE(aa.alloc_total, 0) = 0 AND COALESCE(pa.pay_total, 0) = 0 THEN 'CREDIT_UNPAID'
                WHEN o."paymentStatus" = 'paid' AND COALESCE(aa.alloc_total, 0) = 0 THEN 'NEEDS_AUDIT_CHECK'
                ELSE 'OTHER'
            END AS pre_class
        FROM orders o
        LEFT JOIN alloc_agg aa ON aa."orderId" = o.id
        LEFT JOIN pay_agg pa ON pa."referenceId" = o.id
        WHERE o."isDeleted" = false
    ),
    -- Pass 2: only scan audit_logs for the few orders that need it
    needs_check AS (
        SELECT id::text AS eid FROM base WHERE pre_class = 'NEEDS_AUDIT_CHECK'
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
    )
    SELECT
        b.*,
        COALESCE(tc.cnt, 0) AS toggle_log_count,
        CASE
            WHEN b.pre_class != 'NEEDS_AUDIT_CHECK' THEN b.pre_class
            WHEN COALESCE(tc.cnt, 0) > 0 THEN 'TOGGLED_PAID'
            WHEN cs.created_as = 'paid' THEN 'CASH_SALE'
            WHEN b.total > 0 THEN 'SUSPICIOUS_PAID'
            ELSE 'OTHER'
        END AS classification
    FROM base b
    LEFT JOIN toggle_counts tc ON tc."entityId" = b.id::text
    LEFT JOIN create_status cs ON cs."entityId" = b.id::text
`;

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
                OTHER: { count: 0, totalValue: 0, needsRepair: 0 }
            };
            const suspiciousOrders = [];

            for (const row of orders) {
                const cat = row.classification;
                const total = Number(row.total);
                const bucket = summary[cat] || summary.OTHER;
                bucket.count++;
                bucket.totalValue += total;

                if (cat === 'SUSPICIOUS_PAID') {
                    bucket.needsRepair++;
                    suspiciousOrders.push({
                        orderId: row.id,
                        orderNumber: row.orderNumber,
                        orderDate: row.orderDate,
                        customerName: row.customerName,
                        total,
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
                        expected: { paidAmount: 0, dueAmount: total, paymentStatus: 'unpaid' },
                        needsRepair: true
                    });
                }
            }

            return res.status(200).json({
                status: 200,
                message: `Classified ${orders.length} orders. ${suspiciousOrders.length} need repair.`,
                data: {
                    totalOrders: orders.length,
                    totalNeedsRepair: suspiciousOrders.length,
                    summary,
                    categories: { SUSPICIOUS_PAID: suspiciousOrders }
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
            const repairs = orders
                .filter(r => r.classification === 'SUSPICIOUS_PAID')
                .map(row => ({
                    orderId: row.id,
                    orderNumber: row.orderNumber,
                    orderDate: row.orderDate,
                    customerName: row.customerName,
                    total: Number(row.total),
                    current: {
                        paidAmount: Number(row.paidAmount),
                        dueAmount: Number(row.dueAmount),
                        paymentStatus: row.paymentStatus
                    },
                    expected: { paidAmount: 0, dueAmount: Number(row.total), paymentStatus: 'unpaid' },
                    repairAction: 'RESET_TO_UNPAID',
                    repairSource: 'SUSPICIOUS — no allocation, no payment, no toggle log'
                }));

            return res.status(200).json({
                status: 200,
                message: `Repair preview: ${repairs.length} orders need repair.`,
                data: { totalRepairs: repairs.length, repairs, byAction: { RESET_TO_UNPAID: repairs.length } }
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
            const suspicious = orders.filter(r => r.classification === 'SUSPICIOUS_PAID');
            if (suspicious.length === 0) {
                return res.status(200).json({ status: 200, message: 'Nothing to repair.', data: { totalRepaired: 0 } });
            }

            const operator = changedBy.trim();
            const results = [];
            const { createAuditLog } = require('../middleware/auditLogger');

            await db.sequelize.transaction(async (transaction) => {
                for (const row of suspicious) {
                    const total = Number(row.total);
                    const current = {
                        paidAmount: Number(row.paidAmount),
                        dueAmount: Number(row.dueAmount),
                        paymentStatus: row.paymentStatus
                    };

                    await db.order.update(
                        { paidAmount: 0, dueAmount: total, paymentStatus: 'unpaid' },
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
                            paidAmount: 0, dueAmount: total, paymentStatus: 'unpaid',
                            source: 'forensic_classification_repair',
                            classification: 'RESET_TO_UNPAID'
                        },
                        description: `[REPAIR] ${row.orderNumber}: ${current.paymentStatus}→unpaid | RESET_TO_UNPAID`,
                        ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                        userAgent: req.headers['user-agent']
                    });

                    results.push({
                        orderId: row.id, orderNumber: row.orderNumber, action: 'RESET_TO_UNPAID',
                        before: current, after: { paidAmount: 0, dueAmount: total, paymentStatus: 'unpaid' }
                    });
                }
            });

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

            return res.status(200).json({
                status: 200,
                message: `Repaired ${results.length} orders. Audit log created for each.`,
                data: { totalRepaired: results.length, repairs: results, validation }
            });
        } catch (error) {
            console.error('Repair execute error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    }
};
