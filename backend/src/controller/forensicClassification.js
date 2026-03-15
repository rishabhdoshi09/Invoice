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
            const [orders] = await db.sequelize.query(`
                WITH order_evidence AS (
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

                        COALESCE(alloc.alloc_total, 0)            AS alloc_total,
                        COALESCE(alloc.alloc_count, 0)            AS alloc_count,
                        COALESCE(pay.pay_total, 0)                AS pay_total,
                        COALESCE(pay.pay_count, 0)                AS pay_count,
                        COALESCE(jb.inv_journal_count, 0)         AS inv_journal_count,
                        COALESCE(tj.toggle_journal_count, 0)      AS toggle_journal_count,
                        COALESCE(al.toggle_log_count, 0)          AS toggle_log_count,
                        al.last_toggle_to,
                        al.last_toggle_by,
                        al.last_toggle_at

                    FROM orders o

                    LEFT JOIN (
                        SELECT "orderId", SUM(amount) AS alloc_total, COUNT(*) AS alloc_count
                        FROM receipt_allocations
                        WHERE "isDeleted" IS NULL OR "isDeleted" = false
                        GROUP BY "orderId"
                    ) alloc ON alloc."orderId" = o.id

                    LEFT JOIN (
                        SELECT "referenceId", SUM(amount) AS pay_total, COUNT(*) AS pay_count
                        FROM payments
                        WHERE "isDeleted" = false AND "referenceType" = 'order'
                        GROUP BY "referenceId"
                    ) pay ON pay."referenceId" = o.id

                    LEFT JOIN (
                        SELECT "referenceId"::uuid, COUNT(*) AS inv_journal_count
                        FROM "journal_batches"
                        WHERE "referenceType" = 'INVOICE'
                        GROUP BY "referenceId"
                    ) jb ON jb."referenceId" = o.id

                    LEFT JOIN (
                        SELECT "referenceId"::uuid, COUNT(*) AS toggle_journal_count
                        FROM "journal_batches"
                        WHERE "referenceType" = 'PAYMENT_TOGGLE'
                        GROUP BY "referenceId"
                    ) tj ON tj."referenceId" = o.id

                    LEFT JOIN LATERAL (
                        SELECT
                            COUNT(*) AS toggle_log_count,
                            (SELECT "newValues"->>'paymentStatus'
                             FROM audit_logs WHERE "entityId" = o.id::text
                             AND "entityType" = 'ORDER_PAYMENT_STATUS'
                             ORDER BY "createdAt" DESC LIMIT 1) AS last_toggle_to,
                            (SELECT "userName"
                             FROM audit_logs WHERE "entityId" = o.id::text
                             AND "entityType" = 'ORDER_PAYMENT_STATUS'
                             ORDER BY "createdAt" DESC LIMIT 1) AS last_toggle_by,
                            (SELECT "createdAt"
                             FROM audit_logs WHERE "entityId" = o.id::text
                             AND "entityType" = 'ORDER_PAYMENT_STATUS'
                             ORDER BY "createdAt" DESC LIMIT 1) AS last_toggle_at
                        FROM audit_logs
                        WHERE "entityId" = o.id::text AND "entityType" = 'ORDER_PAYMENT_STATUS'
                    ) al ON true

                    WHERE o."isDeleted" = false
                )
                SELECT *,
                    CASE
                        WHEN alloc_total >= total AND total > 0
                            THEN 'RECEIPT_PAID'
                        WHEN alloc_total > 0 AND alloc_total < total AND total > 0
                            THEN 'PARTIAL_PAID'
                        WHEN "paymentStatus" = 'paid'
                             AND alloc_total = 0 AND pay_total = 0
                             AND toggle_log_count = 0 AND toggle_journal_count = 0
                             AND total > 0
                            THEN CASE
                                WHEN inv_journal_count > 0 THEN 'CASH_SALE'
                                ELSE 'SUSPICIOUS_PAID'
                            END
                        WHEN "paymentStatus" IN ('unpaid','partial')
                             AND alloc_total = 0 AND pay_total = 0
                            THEN 'CREDIT_UNPAID'
                        WHEN toggle_log_count > 0 AND "paymentStatus" = 'paid' AND alloc_total = 0
                            THEN 'TOGGLED_PAID'
                        WHEN toggle_log_count > 0 AND "paymentStatus" = 'unpaid'
                            THEN 'CREDIT_UNPAID'
                        ELSE 'OTHER'
                    END AS classification
                FROM order_evidence
                ORDER BY
                    CASE
                        WHEN alloc_total >= total AND total > 0 THEN 1
                        WHEN alloc_total > 0 AND alloc_total < total THEN 2
                        ELSE 5
                    END,
                    "orderNumber"
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

                // Check if current fields are consistent with evidence
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
                } else if (cat === 'CASH_SALE') {
                    expectedPaid = total;
                    expectedDue = 0;
                    expectedStatus = 'paid';
                } else if (cat === 'CREDIT_UNPAID') {
                    expectedPaid = 0;
                    expectedDue = total;
                    expectedStatus = 'unpaid';
                } else if (cat === 'SUSPICIOUS_PAID') {
                    expectedPaid = 0;
                    expectedDue = total;
                    expectedStatus = 'unpaid'; // should be unpaid since no evidence of payment
                } else if (cat === 'TOGGLED_PAID') {
                    // User deliberately toggled — trust the toggle
                    expectedPaid = total;
                    expectedDue = 0;
                    expectedStatus = 'paid';
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

            // Category 1: RECEIPT_PAID — set from alloc_total
            for (const o of classified.categories.RECEIPT_PAID) {
                if (o.needsRepair) {
                    repairPlan.push({
                        ...o,
                        repairAction: 'SET_FROM_ALLOCATIONS',
                        repairSource: 'receipt_allocations'
                    });
                }
            }

            // Category 2: PARTIAL_PAID — set from alloc_total
            for (const o of classified.categories.PARTIAL_PAID) {
                if (o.needsRepair) {
                    repairPlan.push({
                        ...o,
                        repairAction: 'SET_FROM_ALLOCATIONS',
                        repairSource: 'receipt_allocations'
                    });
                }
            }

            // Category 3: CASH_SALE — should be paid, paidAmount=total
            for (const o of classified.categories.CASH_SALE) {
                if (o.needsRepair) {
                    repairPlan.push({
                        ...o,
                        repairAction: 'SET_AS_CASH_SALE',
                        repairSource: 'invoice_journal (cash sale at creation)'
                    });
                }
            }

            // Category 4: CREDIT_UNPAID — should be unpaid, paidAmount=0
            for (const o of classified.categories.CREDIT_UNPAID) {
                if (o.needsRepair) {
                    repairPlan.push({
                        ...o,
                        repairAction: 'SET_AS_UNPAID',
                        repairSource: 'no payment evidence found'
                    });
                }
            }

            // Category 5: SUSPICIOUS_PAID — should be unpaid (no evidence of payment)
            for (const o of classified.categories.SUSPICIOUS_PAID) {
                if (o.needsRepair) {
                    repairPlan.push({
                        ...o,
                        repairAction: 'RESET_TO_UNPAID',
                        repairSource: 'SUSPICIOUS — no allocation, no payment, no journal, no toggle'
                    });
                }
            }

            // Category 6: TOGGLED_PAID — user toggled, trust it, only fix field mismatches
            for (const o of (classified.categories.TOGGLED_PAID || [])) {
                if (o.needsRepair) {
                    repairPlan.push({
                        ...o,
                        repairAction: 'FIX_FIELD_MISMATCH',
                        repairSource: 'user toggle audit log'
                    });
                }
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
