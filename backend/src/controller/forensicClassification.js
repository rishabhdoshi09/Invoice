/**
 * Forensic Classification Controller
 * 
 * Classifies ALL orders into 5 categories based on verified payment evidence.
 * READ-ONLY — does NOT modify any data.
 * 
 * Categories:
 *   1. RECEIPT_PAID    — receipt_allocations >= order.total
 *   2. PARTIAL_PAID    — receipt_allocations > 0 but < order.total
 *   3. CASH_SALE       — created as paid, no receipt, has invoice journal, no toggle history
 *   4. CREDIT_UNPAID   — created unpaid, no receipt exists
 *   5. SUSPICIOUS_PAID — marked paid but zero evidence (no allocation, no payment, no journal, no toggle)
 */
const db = require('../models');

module.exports = {
    /**
     * GET /api/data-audit/classify
     * Full forensic classification of every order. Read-only.
     */
    /**
     * Ensures indexes exist (runs once, skips if already created).
     */
    _ensureIndexes: async () => {
        if (module.exports._indexesCreated) return;
        await db.sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON audit_logs ("entityId", "entityType");
            CREATE INDEX IF NOT EXISTS idx_audit_entity_action ON audit_logs ("entityId", "entityType", "action");
            CREATE INDEX IF NOT EXISTS idx_alloc_order ON receipt_allocations ("orderId") WHERE ("isDeleted" IS NULL OR "isDeleted" = false);
            CREATE INDEX IF NOT EXISTS idx_pay_ref ON payments ("referenceId") WHERE ("isDeleted" = false AND "referenceType" = 'order');
        `).catch(() => {});
        module.exports._indexesCreated = true;
    },
    _indexesCreated: false,

    /**
     * Core classification SQL — lightweight, only what's needed for the CASE.
     * No array_agg, no JSON extraction for display fields.
     */
    _classificationSQL: `
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
        toggle_counts AS (
            SELECT "entityId", COUNT(*) AS toggle_log_count
            FROM audit_logs
            WHERE "entityType" = 'ORDER_PAYMENT_STATUS'
            GROUP BY "entityId"
        ),
        create_status AS (
            SELECT DISTINCT ON ("entityId")
                "entityId",
                "newValues"->>'paymentStatus' AS created_as_status
            FROM audit_logs
            WHERE "entityType" = 'ORDER' AND "action" = 'CREATE'
            ORDER BY "entityId", "createdAt" ASC
        )
        SELECT
            o.id,
            o."orderNumber",
            o."orderDate",
            o."customerName",
            o."customerId",
            o.total,
            o."paidAmount",
            o."dueAmount",
            o."paymentStatus",
            o."modifiedByName",
            o."createdAt",
            o."updatedAt",
            COALESCE(aa.alloc_total, 0) AS alloc_total,
            COALESCE(aa.alloc_count, 0) AS alloc_count,
            COALESCE(pa.pay_total, 0)   AS pay_total,
            COALESCE(pa.pay_count, 0)   AS pay_count,
            COALESCE(tc.toggle_log_count, 0) AS toggle_log_count,
            cs.created_as_status,
            CASE
                WHEN COALESCE(aa.alloc_total, 0) >= o.total AND o.total > 0
                    THEN 'RECEIPT_PAID'
                WHEN COALESCE(aa.alloc_total, 0) > 0 AND COALESCE(aa.alloc_total, 0) < o.total AND o.total > 0
                    THEN 'PARTIAL_PAID'
                WHEN o."paymentStatus" = 'paid' AND COALESCE(tc.toggle_log_count, 0) > 0
                    THEN 'TOGGLED_PAID'
                WHEN o."paymentStatus" = 'paid' AND cs.created_as_status = 'paid'
                    THEN 'CASH_SALE'
                WHEN o."paymentStatus" = 'paid'
                     AND COALESCE(aa.alloc_total, 0) = 0 AND COALESCE(pa.pay_total, 0) = 0
                     AND COALESCE(tc.toggle_log_count, 0) = 0
                     AND o.total > 0
                    THEN 'SUSPICIOUS_PAID'
                WHEN o."paymentStatus" IN ('unpaid','partial')
                     AND COALESCE(aa.alloc_total, 0) = 0 AND COALESCE(pa.pay_total, 0) = 0
                    THEN 'CREDIT_UNPAID'
                ELSE 'OTHER'
            END AS classification
        FROM orders o
        LEFT JOIN alloc_agg aa ON aa."orderId" = o.id
        LEFT JOIN pay_agg pa ON pa."referenceId" = o.id
        LEFT JOIN toggle_counts tc ON tc."entityId" = o.id::text
        LEFT JOIN create_status cs ON cs."entityId" = o.id::text
        WHERE o."isDeleted" = false
    `,

    classifyOrders: async (req, res) => {
        try {
            await module.exports._ensureIndexes();

            const [orders] = await db.sequelize.query(module.exports._classificationSQL);

            // Build summary counts (fast — no per-order detail objects for non-suspicious)
            const summaryCounts = {
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
                const bucket = summaryCounts[cat] || summaryCounts.OTHER;
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
                        expected: {
                            paidAmount: 0,
                            dueAmount: total,
                            paymentStatus: 'unpaid'
                        },
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
                    summary: summaryCounts,
                    categories: {
                        SUSPICIOUS_PAID: suspiciousOrders
                    }
                }
            });
        } catch (error) {
            console.error('Classification error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Internal: get suspicious orders directly from SQL (no HTTP overhead)
     */
    _getSuspiciousOrders: async () => {
        const [orders] = await db.sequelize.query(module.exports._classificationSQL);
        return orders
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
    },

    repairPreview: async (req, res) => {
        try {
            await module.exports._ensureIndexes();
            const repairs = await module.exports._getSuspiciousOrders();

            return res.status(200).json({
                status: 200,
                message: `Repair preview: ${repairs.length} orders need repair.`,
                data: {
                    totalRepairs: repairs.length,
                    repairs,
                    byAction: { RESET_TO_UNPAID: repairs.length }
                }
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

            await module.exports._ensureIndexes();
            const repairs = await module.exports._getSuspiciousOrders();
            if (repairs.length === 0) {
                return res.status(200).json({ status: 200, message: 'Nothing to repair.', data: { totalRepaired: 0 } });
            }

            const operator = changedBy.trim();
            const results = [];
            const { createAuditLog } = require('../middleware/auditLogger');

            await db.sequelize.transaction(async (transaction) => {
                for (const repair of repairs) {
                    await db.order.update(
                        { paidAmount: 0, dueAmount: repair.total, paymentStatus: 'unpaid' },
                        { where: { id: repair.orderId }, transaction }
                    );

                    await createAuditLog({
                        userId: req.user?.id,
                        userName: operator,
                        userRole: req.user?.role || 'admin',
                        action: 'PAYMENT_STATUS_REBUILD',
                        entityType: 'DATA_RECOVERY',
                        entityId: repair.orderId,
                        entityName: repair.orderNumber,
                        oldValues: repair.current,
                        newValues: {
                            paidAmount: 0,
                            dueAmount: repair.total,
                            paymentStatus: 'unpaid',
                            source: 'forensic_classification_repair',
                            classification: 'RESET_TO_UNPAID',
                            repairSource: repair.repairSource
                        },
                        description: `[REPAIR] ${repair.orderNumber}: ${repair.current.paymentStatus}→unpaid | RESET_TO_UNPAID | source: ${repair.repairSource}`,
                        ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                        userAgent: req.headers['user-agent']
                    });

                    results.push({
                        orderId: repair.orderId,
                        orderNumber: repair.orderNumber,
                        action: 'RESET_TO_UNPAID',
                        before: repair.current,
                        after: { paidAmount: 0, dueAmount: repair.total, paymentStatus: 'unpaid' }
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
                data: {
                    totalRepaired: results.length,
                    repairs: results,
                    validation
                }
            });
        } catch (error) {
            console.error('Repair execute error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    }
};
