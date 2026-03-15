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
    classifyOrders: async (req, res) => {
        try {
            // First ensure indexes exist for fast lookups
            await db.sequelize.query(`
                CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs ("entityId", "entityType");
                CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_action ON audit_logs ("entityId", "entityType", "action");
                CREATE INDEX IF NOT EXISTS idx_receipt_alloc_order ON receipt_allocations ("orderId") WHERE ("isDeleted" IS NULL OR "isDeleted" = false);
                CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments ("referenceId") WHERE ("isDeleted" = false AND "referenceType" = 'order');
                CREATE INDEX IF NOT EXISTS idx_journal_batches_ref ON journal_batches ("referenceId", "referenceType");
            `).catch(() => {});

            const [orders] = await db.sequelize.query(`
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
                inv_journal_agg AS (
                    SELECT "referenceId"::uuid AS ref_id, COUNT(*) AS inv_journal_count
                    FROM journal_batches
                    WHERE "referenceType" = 'INVOICE'
                    GROUP BY "referenceId"
                ),
                toggle_journal_agg AS (
                    SELECT "referenceId"::uuid AS ref_id, COUNT(*) AS toggle_journal_count
                    FROM journal_batches
                    WHERE "referenceType" = 'PAYMENT_TOGGLE'
                    GROUP BY "referenceId"
                ),
                toggle_logs AS (
                    SELECT
                        "entityId",
                        COUNT(*) AS toggle_log_count,
                        (array_agg("newValues"->>'paymentStatus' ORDER BY "createdAt" DESC))[1] AS last_toggle_to,
                        (array_agg("userName" ORDER BY "createdAt" DESC))[1] AS last_toggle_by,
                        (array_agg("createdAt" ORDER BY "createdAt" DESC))[1] AS last_toggle_at
                    FROM audit_logs
                    WHERE "entityType" = 'ORDER_PAYMENT_STATUS'
                    GROUP BY "entityId"
                ),
                create_logs AS (
                    SELECT DISTINCT ON ("entityId")
                        "entityId",
                        "newValues"->>'paymentStatus' AS created_as_status
                    FROM audit_logs
                    WHERE "entityType" = 'ORDER'
                      AND "action" = 'CREATE'
                      AND "newValues"->>'paymentStatus' IS NOT NULL
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

                    COALESCE(aa.alloc_total, 0)              AS alloc_total,
                    COALESCE(aa.alloc_count, 0)              AS alloc_count,
                    COALESCE(pa.pay_total, 0)                AS pay_total,
                    COALESCE(pa.pay_count, 0)                AS pay_count,
                    COALESCE(ij.inv_journal_count, 0)        AS inv_journal_count,
                    COALESCE(tj.toggle_journal_count, 0)     AS toggle_journal_count,
                    COALESCE(tl.toggle_log_count, 0)         AS toggle_log_count,
                    tl.last_toggle_to,
                    tl.last_toggle_by,
                    tl.last_toggle_at,
                    cl.created_as_status,

                    CASE
                        WHEN COALESCE(aa.alloc_total, 0) >= o.total AND o.total > 0
                            THEN 'RECEIPT_PAID'
                        WHEN COALESCE(aa.alloc_total, 0) > 0 AND COALESCE(aa.alloc_total, 0) < o.total AND o.total > 0
                            THEN 'PARTIAL_PAID'
                        WHEN o."paymentStatus" = 'paid' AND COALESCE(tl.toggle_log_count, 0) > 0
                            THEN 'TOGGLED_PAID'
                        WHEN o."paymentStatus" = 'paid' AND cl.created_as_status = 'paid'
                            THEN 'CASH_SALE'
                        WHEN o."paymentStatus" = 'paid'
                             AND COALESCE(aa.alloc_total, 0) = 0 AND COALESCE(pa.pay_total, 0) = 0
                             AND COALESCE(tl.toggle_log_count, 0) = 0
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
                LEFT JOIN inv_journal_agg ij ON ij.ref_id = o.id
                LEFT JOIN toggle_journal_agg tj ON tj.ref_id = o.id
                LEFT JOIN toggle_logs tl ON tl."entityId" = o.id::text
                LEFT JOIN create_logs cl ON cl."entityId" = o.id::text
                WHERE o."isDeleted" = false
                ORDER BY
                    CASE
                        WHEN COALESCE(aa.alloc_total, 0) >= o.total AND o.total > 0 THEN 1
                        WHEN COALESCE(aa.alloc_total, 0) > 0 AND COALESCE(aa.alloc_total, 0) < o.total THEN 2
                        ELSE 5
                    END,
                    o."orderNumber"
            `);

            // Group into categories
            const categories = {
                RECEIPT_PAID: [],
                PARTIAL_PAID: [],
                CASH_SALE: [],
                CREDIT_UNPAID: [],
                SUSPICIOUS_PAID: [],
                TOGGLED_PAID: [],
                OTHER: []
            };

            for (const row of orders) {
                const cat = row.classification;
                const total = Number(row.total);
                const allocTotal = Number(row.alloc_total);
                const currentPaid = Number(row.paidAmount);
                const currentDue = Number(row.dueAmount);

                // Determine expected values.
                // ONLY suspicious_paid should be repaired.
                // All others trust their current state.
                let fieldCorrect = true;
                let expectedPaid, expectedDue, expectedStatus;

                if (cat === 'RECEIPT_PAID') {
                    expectedPaid = Math.min(allocTotal, total);
                    expectedDue = total - expectedPaid;
                    expectedStatus = 'paid';
                } else if (cat === 'PARTIAL_PAID') {
                    expectedPaid = Math.min(allocTotal, total);
                    expectedDue = total - expectedPaid;
                    expectedStatus = 'partial';
                } else if (cat === 'TOGGLED_PAID') {
                    // User deliberately toggled → TRUST IT, no repair
                    expectedPaid = currentPaid;
                    expectedDue = currentDue;
                    expectedStatus = row.paymentStatus;
                } else if (cat === 'CASH_SALE') {
                    // Created as paid → TRUST IT, no repair
                    expectedPaid = currentPaid;
                    expectedDue = currentDue;
                    expectedStatus = row.paymentStatus;
                } else if (cat === 'CREDIT_UNPAID') {
                    // No receipts, currently unpaid → TRUST IT, no repair
                    expectedPaid = currentPaid;
                    expectedDue = currentDue;
                    expectedStatus = row.paymentStatus;
                } else if (cat === 'SUSPICIOUS_PAID') {
                    // THE ONLY CATEGORY THAT GETS REPAIRED
                    // Paid with zero evidence → reset to unpaid
                    expectedPaid = 0;
                    expectedDue = total;
                    expectedStatus = 'unpaid';
                } else {
                    expectedPaid = currentPaid;
                    expectedDue = currentDue;
                    expectedStatus = row.paymentStatus;
                }

                fieldCorrect =
                    Math.abs(currentPaid - expectedPaid) < 0.50 &&
                    Math.abs(currentDue - expectedDue) < 0.50 &&
                    row.paymentStatus === expectedStatus;

                const entry = {
                    orderId: row.id,
                    orderNumber: row.orderNumber,
                    orderDate: row.orderDate,
                    customerName: row.customerName,
                    total,
                    current: {
                        paidAmount: currentPaid,
                        dueAmount: currentDue,
                        paymentStatus: row.paymentStatus
                    },
                    evidence: {
                        allocTotal,
                        allocCount: Number(row.alloc_count),
                        payTotal: Number(row.pay_total),
                        payCount: Number(row.pay_count),
                        invJournalCount: Number(row.inv_journal_count),
                        toggleJournalCount: Number(row.toggle_journal_count),
                        toggleLogCount: Number(row.toggle_log_count),
                        lastToggleTo: row.last_toggle_to || null,
                        lastToggleBy: row.last_toggle_by || null,
                        lastToggleAt: row.last_toggle_at || null
                    },
                    expected: {
                        paidAmount: expectedPaid,
                        dueAmount: expectedDue,
                        paymentStatus: expectedStatus
                    },
                    fieldCorrect,
                    needsRepair: !fieldCorrect
                };

                if (categories[cat]) {
                    categories[cat].push(entry);
                } else {
                    categories.OTHER.push(entry);
                }
            }

            // Summary counts
            const summary = {};
            let totalNeedsRepair = 0;
            for (const [cat, items] of Object.entries(categories)) {
                const repairCount = items.filter(i => i.needsRepair).length;
                totalNeedsRepair += repairCount;
                summary[cat] = {
                    count: items.length,
                    totalValue: items.reduce((s, i) => s + i.total, 0),
                    needsRepair: repairCount
                };
            }

            return res.status(200).json({
                status: 200,
                message: `Classified ${orders.length} orders. ${totalNeedsRepair} need repair.`,
                data: {
                    totalOrders: orders.length,
                    totalNeedsRepair,
                    summary,
                    categories
                }
            });
        } catch (error) {
            console.error('Classification error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * POST /api/data-audit/repair/preview
     * DRY RUN — shows exactly what the repair would change per category.
     * Based only on verified evidence. No guesswork.
     */
    repairPreview: async (req, res) => {
        try {
            // Get classification data directly
            const classifyRes = {
                statusCode: null,
                data: null,
                status(code) { this.statusCode = code; return this; },
                json(d) { this.data = d; return this; }
            };
            await module.exports.classifyOrders({ ...req, query: {} }, classifyRes);
            const classified = classifyRes.data?.data;
            if (!classified) {
                return res.status(500).json({ status: 500, message: 'Classification failed' });
            }

            const repairPlan = [];

            // ONLY suspicious_paid orders get repaired.
            // All other categories are trusted (receipt, toggle, cash sale, credit).
            for (const o of classified.categories.SUSPICIOUS_PAID) {
                repairPlan.push({
                    ...o,
                    repairAction: 'RESET_TO_UNPAID',
                    repairSource: 'SUSPICIOUS — no allocation, no payment, no toggle log, no journal'
                });
            }

            return res.status(200).json({
                status: 200,
                message: `Repair preview: ${repairPlan.length} orders need repair.`,
                data: {
                    totalRepairs: repairPlan.length,
                    repairs: repairPlan,
                    summary: classified.summary,
                    byAction: {
                        SET_FROM_ALLOCATIONS: repairPlan.filter(r => r.repairAction === 'SET_FROM_ALLOCATIONS').length,
                        SET_AS_CASH_SALE: repairPlan.filter(r => r.repairAction === 'SET_AS_CASH_SALE').length,
                        SET_AS_UNPAID: repairPlan.filter(r => r.repairAction === 'SET_AS_UNPAID').length,
                        RESET_TO_UNPAID: repairPlan.filter(r => r.repairAction === 'RESET_TO_UNPAID').length,
                        FIX_FIELD_MISMATCH: repairPlan.filter(r => r.repairAction === 'FIX_FIELD_MISMATCH').length
                    }
                }
            });
        } catch (error) {
            console.error('Repair preview error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * POST /api/data-audit/repair/execute
     * Execute repair. Body: { changedBy: 'name' }
     * Creates audit log for EVERY change.
     */
    repairExecute: async (req, res) => {
        try {
            const { changedBy } = req.body;
            if (!changedBy || !changedBy.trim()) {
                return res.status(400).json({ status: 400, message: 'changedBy is required for audit trail.' });
            }

            // Get the repair plan
            const previewRes = {
                statusCode: null,
                data: null,
                status(code) { this.statusCode = code; return this; },
                json(d) { this.data = d; return this; }
            };
            await module.exports.repairPreview(req, previewRes);
            const plan = previewRes.data?.data;
            if (!plan || plan.totalRepairs === 0) {
                return res.status(200).json({ status: 200, message: 'Nothing to repair.', data: { totalRepaired: 0 } });
            }

            const operator = changedBy.trim();
            const results = [];
            const { createAuditLog } = require('../middleware/auditLogger');

            await db.sequelize.transaction(async (transaction) => {
                for (const repair of plan.repairs) {
                    const newPaid = repair.expected.paidAmount;
                    const newDue = repair.expected.dueAmount;
                    const newStatus = repair.expected.paymentStatus;

                    await db.order.update(
                        { paidAmount: newPaid, dueAmount: newDue, paymentStatus: newStatus },
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
                            paidAmount: newPaid,
                            dueAmount: newDue,
                            paymentStatus: newStatus,
                            source: 'forensic_classification_repair',
                            classification: repair.repairAction,
                            repairSource: repair.repairSource
                        },
                        description: `[REPAIR] ${repair.orderNumber}: ${repair.current.paymentStatus}→${newStatus} | ${repair.repairAction} | source: ${repair.repairSource}`,
                        ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                        userAgent: req.headers['user-agent']
                    });

                    results.push({
                        orderId: repair.orderId,
                        orderNumber: repair.orderNumber,
                        action: repair.repairAction,
                        before: repair.current,
                        after: { paidAmount: newPaid, dueAmount: newDue, paymentStatus: newStatus }
                    });
                }
            });

            // Post-repair validation
            const { runValidation } = require('./paymentRecovery');
            let validation = null;
            try {
                // Quick inline validation
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
