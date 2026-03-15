/**
 * Payment Recovery Controller
 * 
 * Implements the 8-step recovery specification:
 *   Step 1: Backup (informational - user must do on their machine)
 *   Step 2-4: Recalculate from receipt_allocations
 *   Step 5: Handle orders with no allocations (set to unpaid, exclude cash sales)
 *   Step 6: Audit logging for every change
 *   Step 7: Post-repair validation
 *   Step 8: Prevention (toggle endpoint modification - separate file)
 */
const db = require('../models');
const { createAuditLog } = require('../middleware/auditLogger');

module.exports = {
    /**
     * GET /api/data-audit/recovery/preview
     * DRY RUN — shows exactly what would change without modifying anything.
     */
    recoveryPreview: async (req, res) => {
        try {
            // === STEP 2: Calculate real payments from receipt_allocations ===
            const [allocatedOrders] = await db.sequelize.query(`
                SELECT
                    o.id,
                    o."orderNumber",
                    o.total,
                    o."paidAmount"   AS current_paid,
                    o."dueAmount"    AS current_due,
                    o."paymentStatus" AS current_status,
                    o."customerName",
                    o."modifiedByName",
                    o."createdAt",
                    COALESCE(alloc.actual_paid, 0) AS actual_paid
                FROM orders o
                INNER JOIN (
                    SELECT "orderId", SUM(amount) AS actual_paid
                    FROM receipt_allocations
                    WHERE "isDeleted" IS NULL OR "isDeleted" = false
                    GROUP BY "orderId"
                ) alloc ON alloc."orderId" = o.id
                WHERE o."isDeleted" = false
                ORDER BY o."createdAt" DESC
            `);

            // === STEP 3: Recalculate fields ===
            const step2_4_changes = [];
            for (const row of allocatedOrders) {
                const total = Number(row.total);
                const actualPaid = Number(row.actual_paid);
                const newPaid = Math.min(actualPaid, total); // can't overpay
                const newDue = total - newPaid;
                const newStatus = newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

                const currentPaid = Number(row.current_paid);
                const currentDue = Number(row.current_due);
                const currentStatus = row.current_status;

                // Only flag if something actually changes
                const paidChanged = Math.abs(currentPaid - newPaid) > 0.01;
                const dueChanged = Math.abs(currentDue - newDue) > 0.01;
                const statusChanged = currentStatus !== newStatus;

                if (paidChanged || dueChanged || statusChanged) {
                    step2_4_changes.push({
                        orderId: row.id,
                        orderNumber: row.orderNumber,
                        customerName: row.customerName,
                        total,
                        current: { paidAmount: currentPaid, dueAmount: currentDue, paymentStatus: currentStatus },
                        corrected: { paidAmount: newPaid, dueAmount: newDue, paymentStatus: newStatus },
                        allocationTotal: actualPaid,
                        source: 'receipt_allocations'
                    });
                }
            }

            // === STEP 5: Orders with NO allocations that are marked 'paid' ===
            // These should be set to unpaid UNLESS they are legitimate cash sales
            const [noAllocPaidOrders] = await db.sequelize.query(`
                SELECT
                    o.id,
                    o."orderNumber",
                    o.total,
                    o."paidAmount"   AS current_paid,
                    o."dueAmount"    AS current_due,
                    o."paymentStatus" AS current_status,
                    o."customerName",
                    o."modifiedByName",
                    o."createdAt"
                FROM orders o
                WHERE o."isDeleted" = false
                  AND o."paymentStatus" = 'paid'
                  AND o.total > 0
                  AND o.id NOT IN (
                      SELECT DISTINCT "orderId"
                      FROM receipt_allocations
                      WHERE "isDeleted" IS NULL OR "isDeleted" = false
                  )
                ORDER BY o."createdAt" DESC
            `);

            // Detect cash sales evidence for each
            const step5_changes = [];
            for (const row of noAllocPaidOrders) {
                const orderId = row.id;

                // Evidence check 1: Has toggle audit log to 'paid'?
                const [toggleLogs] = await db.sequelize.query(`
                    SELECT "userName", "createdAt", "description"
                    FROM audit_logs
                    WHERE "entityId" = :orderId
                      AND "entityType" = 'ORDER_PAYMENT_STATUS'
                      AND "newValues"->>'paymentStatus' = 'paid'
                    ORDER BY "createdAt" DESC
                    LIMIT 1
                `, { replacements: { orderId: String(orderId) } });

                // Evidence check 2: Has a PAYMENT_TOGGLE journal? (toggled to paid with ledger)
                const [toggleJournals] = await db.sequelize.query(`
                    SELECT id FROM "journal_batches"
                    WHERE "referenceId"::text = :orderId
                      AND "referenceType" = 'PAYMENT_TOGGLE'
                    LIMIT 1
                `, { replacements: { orderId: String(orderId) } });

                // Evidence check 3: Has any linked payment?
                const [directPayments] = await db.sequelize.query(`
                    SELECT id FROM payments
                    WHERE "referenceId"::text = :orderId
                      AND "referenceType" = 'order'
                      AND "isDeleted" = false
                    LIMIT 1
                `, { replacements: { orderId: String(orderId) } });

                const hasToggleLog = toggleLogs.length > 0;
                const hasToggleJournal = toggleJournals.length > 0;
                const hasDirectPayment = directPayments.length > 0;
                const hasEvidence = hasToggleLog || hasToggleJournal || hasDirectPayment;

                // If evidence exists → likely user-authorized change → mark as EXCLUDED
                // If no evidence → cash sale at counter (default creation) OR corruption
                step5_changes.push({
                    orderId: row.id,
                    orderNumber: row.orderNumber,
                    customerName: row.customerName,
                    total: Number(row.total),
                    current: {
                        paidAmount: Number(row.current_paid),
                        dueAmount: Number(row.current_due),
                        paymentStatus: row.current_status
                    },
                    corrected: { paidAmount: 0, dueAmount: Number(row.total), paymentStatus: 'unpaid' },
                    evidence: {
                        hasToggleLog,
                        toggledBy: hasToggleLog ? toggleLogs[0].userName : null,
                        hasToggleJournal,
                        hasDirectPayment
                    },
                    isCashSale: !hasEvidence, // No evidence of change = likely created as paid (cash sale)
                    excluded: !hasEvidence,    // Exclude cash sales by default
                    excludeReason: !hasEvidence
                        ? 'Likely cash sale (created as paid, no status change evidence)'
                        : null,
                    source: 'no_allocations'
                });
            }

            // Summary
            const includedStep5 = step5_changes.filter(c => !c.excluded);
            const excludedStep5 = step5_changes.filter(c => c.excluded);

            return res.status(200).json({
                status: 200,
                message: `Recovery preview: ${step2_4_changes.length} from allocations, ${includedStep5.length} no-allocation resets (${excludedStep5.length} cash sales excluded).`,
                data: {
                    backupReminder: 'Run pg_dump before executing: pg_dump database_name > backup_before_payment_recovery.sql',
                    step2_4: {
                        description: 'Orders recalculated from receipt_allocations',
                        count: step2_4_changes.length,
                        orders: step2_4_changes
                    },
                    step5: {
                        description: 'Paid orders with no allocations → reset to unpaid (cash sales excluded)',
                        totalFound: noAllocPaidOrders.length,
                        includedCount: includedStep5.length,
                        excludedCount: excludedStep5.length,
                        included: includedStep5,
                        excluded: excludedStep5
                    },
                    totalChanges: step2_4_changes.length + includedStep5.length
                }
            });

        } catch (error) {
            console.error('Recovery preview error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * POST /api/data-audit/recovery/execute
     * Execute the recovery. Body: { changedBy, includeExcluded: false }
     */
    recoveryExecute: async (req, res) => {
        try {
            const { changedBy, includeExcluded } = req.body;

            if (!changedBy || !changedBy.trim()) {
                return res.status(400).json({ status: 400, message: 'changedBy is required for audit trail.' });
            }

            const operator = changedBy.trim();
            const results = { step2_4: [], step5: [], auditLogs: 0, errors: [] };

            await db.sequelize.transaction(async (transaction) => {

                // === STEP 2-4: Update orders with allocations ===
                const [allocatedOrders] = await db.sequelize.query(`
                    SELECT
                        o.id, o."orderNumber", o.total, o."customerName",
                        o."paidAmount" AS current_paid, o."dueAmount" AS current_due,
                        o."paymentStatus" AS current_status,
                        COALESCE(alloc.actual_paid, 0) AS actual_paid
                    FROM orders o
                    INNER JOIN (
                        SELECT "orderId", SUM(amount) AS actual_paid
                        FROM receipt_allocations
                        WHERE "isDeleted" IS NULL OR "isDeleted" = false
                        GROUP BY "orderId"
                    ) alloc ON alloc."orderId" = o.id
                    WHERE o."isDeleted" = false
                `, { transaction });

                for (const row of allocatedOrders) {
                    const total = Number(row.total);
                    const actualPaid = Number(row.actual_paid);
                    const newPaid = Math.min(actualPaid, total);
                    const newDue = total - newPaid;
                    const newStatus = newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

                    const currentPaid = Number(row.current_paid);
                    const currentDue = Number(row.current_due);
                    const currentStatus = row.current_status;

                    const paidChanged = Math.abs(currentPaid - newPaid) > 0.01;
                    const dueChanged = Math.abs(currentDue - newDue) > 0.01;
                    const statusChanged = currentStatus !== newStatus;

                    if (paidChanged || dueChanged || statusChanged) {
                        await db.order.update(
                            { paidAmount: newPaid, dueAmount: newDue, paymentStatus: newStatus },
                            { where: { id: row.id }, transaction }
                        );

                        // STEP 6: Audit log
                        await createAuditLog({
                            userId: req.user?.id,
                            userName: operator,
                            userRole: req.user?.role || 'admin',
                            action: 'PAYMENT_STATUS_REBUILD',
                            entityType: 'DATA_RECOVERY',
                            entityId: row.id,
                            entityName: row.orderNumber,
                            oldValues: { paidAmount: currentPaid, dueAmount: currentDue, paymentStatus: currentStatus },
                            newValues: { paidAmount: newPaid, dueAmount: newDue, paymentStatus: newStatus, source: 'forensic_repair_script', allocationTotal: actualPaid },
                            description: `[RECOVERY] ${row.orderNumber}: ${currentStatus}→${newStatus} (paid: ${currentPaid}→${newPaid}) from receipt_allocations`,
                            ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                            userAgent: req.headers['user-agent']
                        });
                        results.auditLogs++;

                        results.step2_4.push({
                            orderId: row.id,
                            orderNumber: row.orderNumber,
                            before: { paidAmount: currentPaid, dueAmount: currentDue, paymentStatus: currentStatus },
                            after: { paidAmount: newPaid, dueAmount: newDue, paymentStatus: newStatus }
                        });
                    }
                }

                // === STEP 5: Orders without allocations, currently paid ===
                const [noAllocPaidOrders] = await db.sequelize.query(`
                    SELECT o.id, o."orderNumber", o.total, o."customerName",
                           o."paidAmount" AS current_paid, o."dueAmount" AS current_due,
                           o."paymentStatus" AS current_status
                    FROM orders o
                    WHERE o."isDeleted" = false
                      AND o."paymentStatus" = 'paid'
                      AND o.total > 0
                      AND o.id NOT IN (
                          SELECT DISTINCT "orderId"
                          FROM receipt_allocations
                          WHERE "isDeleted" IS NULL OR "isDeleted" = false
                      )
                `, { transaction });

                for (const row of noAllocPaidOrders) {
                    const orderId = row.id;

                    // Cash sale detection (same as preview)
                    if (!includeExcluded) {
                        const [toggleLogs] = await db.sequelize.query(`
                            SELECT 1 FROM audit_logs
                            WHERE "entityId" = :orderId
                              AND "entityType" = 'ORDER_PAYMENT_STATUS'
                              AND "newValues"->>'paymentStatus' = 'paid'
                            LIMIT 1
                        `, { replacements: { orderId: String(orderId) }, transaction });
                        const [toggleJournals] = await db.sequelize.query(`
                            SELECT 1 FROM "journal_batches"
                            WHERE "referenceId"::text = :orderId AND "referenceType" = 'PAYMENT_TOGGLE'
                            LIMIT 1
                        `, { replacements: { orderId: String(orderId) }, transaction });
                        const [directPayments] = await db.sequelize.query(`
                            SELECT 1 FROM payments
                            WHERE "referenceId"::text = :orderId AND "referenceType" = 'order' AND "isDeleted" = false
                            LIMIT 1
                        `, { replacements: { orderId: String(orderId) }, transaction });

                        const hasEvidence = toggleLogs.length > 0 || toggleJournals.length > 0 || directPayments.length > 0;
                        if (!hasEvidence) {
                            // Cash sale — skip
                            continue;
                        }
                    }

                    const total = Number(row.total);
                    await db.order.update(
                        { paidAmount: 0, dueAmount: total, paymentStatus: 'unpaid' },
                        { where: { id: row.id }, transaction }
                    );

                    // STEP 6: Audit log
                    await createAuditLog({
                        userId: req.user?.id,
                        userName: operator,
                        userRole: req.user?.role || 'admin',
                        action: 'PAYMENT_STATUS_REBUILD',
                        entityType: 'DATA_RECOVERY',
                        entityId: row.id,
                        entityName: row.orderNumber,
                        oldValues: { paidAmount: Number(row.current_paid), dueAmount: Number(row.current_due), paymentStatus: row.current_status },
                        newValues: { paidAmount: 0, dueAmount: total, paymentStatus: 'unpaid', source: 'forensic_repair_script' },
                        description: `[RECOVERY] ${row.orderNumber}: paid→unpaid (no receipt allocations found)`,
                        ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                        userAgent: req.headers['user-agent']
                    });
                    results.auditLogs++;

                    results.step5.push({
                        orderId: row.id,
                        orderNumber: row.orderNumber,
                        before: { paidAmount: Number(row.current_paid), dueAmount: Number(row.current_due), paymentStatus: 'paid' },
                        after: { paidAmount: 0, dueAmount: total, paymentStatus: 'unpaid' }
                    });
                }
            });

            // === STEP 7: Post-repair validation ===
            const validation = await runValidation();

            return res.status(200).json({
                status: 200,
                message: `Recovery complete. ${results.step2_4.length} orders recalculated from allocations, ${results.step5.length} orders reset to unpaid. ${results.auditLogs} audit logs created.`,
                data: {
                    step2_4: { count: results.step2_4.length, orders: results.step2_4 },
                    step5: { count: results.step5.length, orders: results.step5 },
                    totalChanged: results.step2_4.length + results.step5.length,
                    auditLogsCreated: results.auditLogs,
                    validation
                }
            });

        } catch (error) {
            console.error('Recovery execute error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * GET /api/data-audit/recovery/validate
     * Post-repair validation checks (Step 7)
     */
    recoveryValidate: async (req, res) => {
        try {
            const validation = await runValidation();
            return res.status(200).json({
                status: 200,
                message: validation.allPassed ? 'All validation checks passed.' : 'Some checks failed.',
                data: validation
            });
        } catch (error) {
            console.error('Validation error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    }
};

// === Shared validation function (Step 7) ===
async function runValidation() {
    const checks = [];

    // Check 1: No order has paymentStatus='paid' AND paidAmount=0
    const [paidZero] = await db.sequelize.query(`
        SELECT "orderNumber", total, "paidAmount", "paymentStatus"
        FROM orders
        WHERE "isDeleted" = false AND "paymentStatus" = 'paid' AND "paidAmount" = 0 AND total > 0
    `);
    checks.push({
        name: 'No paid orders with zero paidAmount',
        passed: paidZero.length === 0,
        violations: paidZero.length,
        details: paidZero.slice(0, 10)
    });

    // Check 2: No order has dueAmount < 0
    const [negativeDue] = await db.sequelize.query(`
        SELECT "orderNumber", total, "paidAmount", "dueAmount"
        FROM orders
        WHERE "isDeleted" = false AND "dueAmount" < 0
    `);
    checks.push({
        name: 'No orders with negative dueAmount',
        passed: negativeDue.length === 0,
        violations: negativeDue.length,
        details: negativeDue.slice(0, 10)
    });

    // Check 3: paidAmount + dueAmount = total for all orders
    const [sumMismatch] = await db.sequelize.query(`
        SELECT "orderNumber", total, "paidAmount", "dueAmount",
               ("paidAmount" + "dueAmount") AS computed_sum,
               ABS("paidAmount" + "dueAmount" - total) AS diff
        FROM orders
        WHERE "isDeleted" = false AND ABS("paidAmount" + "dueAmount" - total) > 0.50
    `);
    checks.push({
        name: 'paidAmount + dueAmount = total',
        passed: sumMismatch.length === 0,
        violations: sumMismatch.length,
        details: sumMismatch.slice(0, 10)
    });

    // Check 4: Status matches amounts
    const [statusMismatch] = await db.sequelize.query(`
        SELECT "orderNumber", total, "paidAmount", "dueAmount", "paymentStatus"
        FROM orders
        WHERE "isDeleted" = false AND total > 0 AND (
            ("paymentStatus" = 'paid' AND "dueAmount" > 0.50)
            OR ("paymentStatus" = 'unpaid' AND "paidAmount" > 0.50)
        )
    `);
    checks.push({
        name: 'paymentStatus consistent with amounts',
        passed: statusMismatch.length === 0,
        violations: statusMismatch.length,
        details: statusMismatch.slice(0, 10)
    });

    return {
        allPassed: checks.every(c => c.passed),
        checks
    };
}
