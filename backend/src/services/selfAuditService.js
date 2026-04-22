/**
 * Self-Audit Service — L3 Invariant Engine
 *
 * Runs 14 named invariants across the full financial graph.
 * Each check returns: { id, name, status, severity, count, detail }
 *
 * Severity levels:
 *   INFO     — informational, no action needed
 *   WARNING  — drift detected, schedule review
 *   CRITICAL — invariant violated, flag records, alert immediately
 *   HALT     — system integrity compromised, block financial writes
 *
 * Invariant catalogue:
 *   INV-01  Σ(debit) = Σ(credit) across all posted, non-reversed journal entries
 *   INV-02  Every journal batch has totalDebit = totalCredit
 *   INV-03  Every invoice: Σ(lineTotal) = subTotal  (server-side math already enforces this at write)
 *   INV-04  Every invoice: subTotal + tax = total
 *   INV-05  Every invoice: paidAmount + dueAmount = total
 *   INV-06  Every 'paid' invoice: paidAmount = total, dueAmount = 0
 *   INV-07  Every 'unpaid' invoice: dueAmount = total (paidAmount may be 0 or partial)
 *   INV-08  No invoice has paidAmount > total
 *   INV-09  Every invoice with a customerId has an INVOICE journal batch (if CoA exists)
 *   INV-10  Every INVOICE journal batch references a non-deleted order
 *   INV-11  Every INVOICE_CASH batch references an invoice whose paidAmount > 0
 *   INV-12  No orphan payments (payment.partyId references a real customer/supplier)
 *   INV-13  Receipt allocation total per invoice ≤ invoice.total
 *   INV-14  Receipt allocation total per payment ≤ payment.amount
 */

const TOLERANCE = 0.01; // max allowed paisa-level rounding gap

class SelfAuditService {
    constructor(db) {
        this.db = db;
    }

    // ─── public entry point ──────────────────────────────────────────────────

    /**
     * Run all invariants. Returns a structured report.
     * @param {Object} opts
     * @param {boolean} opts.writeHistory  - persist result to reconciliation_runs table
     * @param {string}  opts.triggeredBy   - 'scheduler' | 'api' | 'startup'
     */
    async run({ writeHistory = true, triggeredBy = 'scheduler' } = {}) {
        const startedAt = new Date();
        const results = [];

        const checks = [
            this._inv01_globalDebitCreditBalance.bind(this),
            this._inv02_batchBalance.bind(this),
            this._inv03_invoiceLineSum.bind(this),
            this._inv04_invoiceTotalFormula.bind(this),
            this._inv05_paidPlusDueEqualsTotal.bind(this),
            this._inv06_paidStatusConsistency.bind(this),
            this._inv07_unpaidStatusConsistency.bind(this),
            this._inv08_noOverpayment.bind(this),
            this._inv09_invoiceJournalCompleteness.bind(this),
            this._inv10_noOrphanInvoiceBatches.bind(this),
            this._inv11_invoiceCashBatchConsistency.bind(this),
            this._inv12_noOrphanPayments.bind(this),
            this._inv13_allocationVsInvoiceTotal.bind(this),
            this._inv14_allocationVsPaymentTotal.bind(this),
        ];

        for (const check of checks) {
            try {
                results.push(await check());
            } catch (err) {
                results.push({
                    id: check.name.replace('bound ', '').replace('_', '-').toUpperCase(),
                    name: check.name,
                    status: 'ERROR',
                    severity: 'CRITICAL',
                    count: 0,
                    detail: `Check threw: ${err.message}`
                });
            }
        }

        const summary = this._summarise(results);
        const finishedAt = new Date();
        const durationMs = finishedAt - startedAt;

        const report = { triggeredBy, startedAt, finishedAt, durationMs, summary, results };

        if (writeHistory) {
            await this._persist(report).catch(e =>
                console.error('[SELF-AUDIT] Failed to persist run history:', e.message)
            );
        }

        this._log(report);
        return report;
    }

    // ─── invariant checks ────────────────────────────────────────────────────

    async _inv01_globalDebitCreditBalance() {
        const [rows] = await this.db.sequelize.query(`
            SELECT
                COALESCE(SUM(le.debit),  0) AS total_debit,
                COALESCE(SUM(le.credit), 0) AS total_credit,
                ABS(COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)) AS diff
            FROM ledger_entries le
            INNER JOIN journal_batches jb ON le."batchId" = jb.id
            WHERE jb."isPosted" = true AND jb."isReversed" = false
        `);
        const { total_debit, total_credit, diff } = rows[0];
        const ok = Number(diff) <= TOLERANCE;
        return {
            id: 'INV-01',
            name: 'Global debit = credit',
            status: ok ? 'PASS' : 'FAIL',
            severity: ok ? 'INFO' : 'HALT',
            count: ok ? 0 : 1,
            detail: ok
                ? `DR ${Number(total_debit).toFixed(2)} == CR ${Number(total_credit).toFixed(2)}`
                : `DR ${Number(total_debit).toFixed(2)} ≠ CR ${Number(total_credit).toFixed(2)}  (diff ₹${Number(diff).toFixed(2)})`
        };
    }

    async _inv02_batchBalance() {
        const [rows] = await this.db.sequelize.query(`
            SELECT jb.id, jb."batchNumber", jb."referenceType",
                   COALESCE(SUM(le.debit), 0)  AS sum_debit,
                   COALESCE(SUM(le.credit), 0) AS sum_credit,
                   ABS(COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)) AS diff
            FROM journal_batches jb
            LEFT JOIN ledger_entries le ON le."batchId" = jb.id
            WHERE jb."isPosted" = true AND jb."isReversed" = false
            GROUP BY jb.id, jb."batchNumber", jb."referenceType"
            HAVING ABS(COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)) > ${TOLERANCE}
            LIMIT 100
        `);
        const ok = rows.length === 0;
        return {
            id: 'INV-02',
            name: 'Each batch is internally balanced',
            status: ok ? 'PASS' : 'FAIL',
            severity: ok ? 'INFO' : 'CRITICAL',
            count: rows.length,
            detail: ok ? 'All batches balanced' : rows.map(r =>
                `Batch ${r.batchNumber} (${r.referenceType}): DR ${Number(r.sum_debit).toFixed(2)} CR ${Number(r.sum_credit).toFixed(2)}`
            )
        };
    }

    async _inv03_invoiceLineSum() {
        const [rows] = await this.db.sequelize.query(`
            SELECT o.id, o."orderNumber",
                   o."subTotal",
                   COALESCE(SUM(oi."totalPrice"), 0) AS computed_sub,
                   ABS(CAST(o."subTotal" AS NUMERIC) - COALESCE(SUM(oi."totalPrice"), 0)) AS diff
            FROM orders o
            LEFT JOIN "orderItems" oi ON oi."orderId" = o.id
            WHERE o."isDeleted" = false
            GROUP BY o.id, o."orderNumber", o."subTotal"
            HAVING ABS(CAST(o."subTotal" AS NUMERIC) - COALESCE(SUM(oi."totalPrice"), 0)) > ${TOLERANCE}
            LIMIT 100
        `);
        const ok = rows.length === 0;
        return {
            id: 'INV-03',
            name: 'Invoice subTotal = Σ(line items)',
            status: ok ? 'PASS' : 'FAIL',
            severity: ok ? 'INFO' : 'CRITICAL',
            count: rows.length,
            detail: ok ? 'All invoices balanced' : rows.map(r =>
                `${r.orderNumber}: stored subTotal ${Number(r.subTotal).toFixed(2)} ≠ line sum ${Number(r.computed_sub).toFixed(2)}`
            )
        };
    }

    async _inv04_invoiceTotalFormula() {
        const [rows] = await this.db.sequelize.query(`
            SELECT id, "orderNumber", "subTotal", tax, total,
                   ABS(CAST("subTotal" AS NUMERIC) + CAST(COALESCE(tax, 0) AS NUMERIC) - CAST(total AS NUMERIC)) AS diff
            FROM orders
            WHERE "isDeleted" = false
              AND ABS(CAST("subTotal" AS NUMERIC) + CAST(COALESCE(tax, 0) AS NUMERIC) - CAST(total AS NUMERIC)) > ${TOLERANCE}
            LIMIT 100
        `);
        const ok = rows.length === 0;
        return {
            id: 'INV-04',
            name: 'total = subTotal + tax',
            status: ok ? 'PASS' : 'FAIL',
            severity: ok ? 'INFO' : 'CRITICAL',
            count: rows.length,
            detail: ok ? 'All totals consistent' : rows.map(r =>
                `${r.orderNumber}: subTotal(${r.subTotal}) + tax(${r.tax}) ≠ total(${r.total})`
            )
        };
    }

    async _inv05_paidPlusDueEqualsTotal() {
        const [rows] = await this.db.sequelize.query(`
            SELECT id, "orderNumber", "paidAmount", "dueAmount", total,
                   ABS(CAST("paidAmount" AS NUMERIC) + CAST("dueAmount" AS NUMERIC) - CAST(total AS NUMERIC)) AS diff
            FROM orders
            WHERE "isDeleted" = false
              AND ABS(CAST("paidAmount" AS NUMERIC) + CAST("dueAmount" AS NUMERIC) - CAST(total AS NUMERIC)) > ${TOLERANCE}
            LIMIT 100
        `);
        const ok = rows.length === 0;
        return {
            id: 'INV-05',
            name: 'paidAmount + dueAmount = total',
            status: ok ? 'PASS' : 'FAIL',
            severity: ok ? 'INFO' : 'CRITICAL',
            count: rows.length,
            detail: ok ? 'All invoices consistent' : rows.map(r =>
                `${r.orderNumber}: paid(${r.paidAmount}) + due(${r.dueAmount}) ≠ total(${r.total})`
            )
        };
    }

    async _inv06_paidStatusConsistency() {
        const [rows] = await this.db.sequelize.query(`
            SELECT id, "orderNumber", "paymentStatus", "paidAmount", "dueAmount", total
            FROM orders
            WHERE "isDeleted" = false
              AND "paymentStatus" = 'paid'
              AND (
                CAST("dueAmount" AS NUMERIC) > ${TOLERANCE}
                OR ABS(CAST("paidAmount" AS NUMERIC) - CAST(total AS NUMERIC)) > ${TOLERANCE}
              )
            LIMIT 100
        `);
        const ok = rows.length === 0;
        return {
            id: 'INV-06',
            name: "status='paid' ⟹ paidAmount=total AND dueAmount=0",
            status: ok ? 'PASS' : 'FAIL',
            severity: ok ? 'INFO' : 'CRITICAL',
            count: rows.length,
            detail: ok ? 'All paid invoices consistent' : rows.map(r =>
                `${r.orderNumber}: status=paid but paid=${r.paidAmount} due=${r.dueAmount} total=${r.total}`
            )
        };
    }

    async _inv07_unpaidStatusConsistency() {
        const [rows] = await this.db.sequelize.query(`
            SELECT id, "orderNumber", "paymentStatus", "paidAmount", "dueAmount", total
            FROM orders
            WHERE "isDeleted" = false
              AND "paymentStatus" = 'unpaid'
              AND CAST("paidAmount" AS NUMERIC) > ${TOLERANCE}
            LIMIT 100
        `);
        const ok = rows.length === 0;
        return {
            id: 'INV-07',
            name: "status='unpaid' ⟹ paidAmount=0",
            status: ok ? 'PASS' : 'FAIL',
            severity: ok ? 'INFO' : 'CRITICAL',
            count: rows.length,
            detail: ok ? 'All unpaid invoices consistent' : rows.map(r =>
                `${r.orderNumber}: status=unpaid but paidAmount=${r.paidAmount}`
            )
        };
    }

    async _inv08_noOverpayment() {
        const [rows] = await this.db.sequelize.query(`
            SELECT id, "orderNumber", "paidAmount", total
            FROM orders
            WHERE "isDeleted" = false
              AND CAST("paidAmount" AS NUMERIC) > CAST(total AS NUMERIC) + ${TOLERANCE}
            LIMIT 100
        `);
        const ok = rows.length === 0;
        return {
            id: 'INV-08',
            name: 'No invoice overpayment (paidAmount ≤ total)',
            status: ok ? 'PASS' : 'FAIL',
            severity: ok ? 'INFO' : 'CRITICAL',
            count: rows.length,
            detail: ok ? 'No overpayments found' : rows.map(r =>
                `${r.orderNumber}: paidAmount(${r.paidAmount}) > total(${r.total})`
            )
        };
    }

    async _inv09_invoiceJournalCompleteness() {
        // Only meaningful if CoA is initialized
        const [coaRows] = await this.db.sequelize.query(`SELECT COUNT(*) AS cnt FROM accounts`);
        if (Number(coaRows[0].cnt) === 0) {
            return { id: 'INV-09', name: 'Invoice → journal completeness', status: 'SKIP',
                severity: 'INFO', count: 0, detail: 'CoA not initialized' };
        }

        const [rows] = await this.db.sequelize.query(`
            SELECT o.id, o."orderNumber", o."customerId", o."customerName"
            FROM orders o
            WHERE o."isDeleted" = false
              AND o."customerId" IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM journal_batches jb
                  WHERE jb."referenceType" = 'INVOICE'
                    AND jb."referenceId" = o.id
                    AND jb."isPosted" = true
              )
            LIMIT 100
        `);
        const ok = rows.length === 0;
        return {
            id: 'INV-09',
            name: 'Every linked invoice has a journal batch',
            status: ok ? 'PASS' : 'FAIL',
            severity: ok ? 'INFO' : 'CRITICAL',
            count: rows.length,
            detail: ok ? 'All invoices journalised' : rows.map(r =>
                `${r.orderNumber} (customer: ${r.customerName}) has no INVOICE journal batch`
            )
        };
    }

    async _inv10_noOrphanInvoiceBatches() {
        const [rows] = await this.db.sequelize.query(`
            SELECT jb.id, jb."batchNumber", jb."referenceId"
            FROM journal_batches jb
            WHERE jb."referenceType" = 'INVOICE'
              AND jb."isReversed" = false
              AND NOT EXISTS (
                  SELECT 1 FROM orders o
                  WHERE o.id = jb."referenceId" AND o."isDeleted" = false
              )
            LIMIT 100
        `);
        const ok = rows.length === 0;
        return {
            id: 'INV-10',
            name: 'No orphan INVOICE journal batches',
            status: ok ? 'PASS' : 'FAIL',
            severity: ok ? 'INFO' : 'WARNING',
            count: rows.length,
            detail: ok ? 'No orphan batches' : rows.map(r =>
                `Batch ${r.batchNumber} references missing/deleted order ${r.referenceId}`
            )
        };
    }

    async _inv11_invoiceCashBatchConsistency() {
        const [rows] = await this.db.sequelize.query(`
            SELECT jb.id, jb."batchNumber", jb."referenceId", o."orderNumber", o."paidAmount"
            FROM journal_batches jb
            LEFT JOIN orders o ON o.id = jb."referenceId"
            WHERE jb."referenceType" = 'INVOICE_CASH'
              AND jb."isReversed" = false
              AND (o.id IS NULL OR CAST(o."paidAmount" AS NUMERIC) <= 0)
            LIMIT 100
        `);
        const ok = rows.length === 0;
        return {
            id: 'INV-11',
            name: 'INVOICE_CASH batch ⟹ invoice.paidAmount > 0',
            status: ok ? 'PASS' : 'FAIL',
            severity: ok ? 'INFO' : 'WARNING',
            count: rows.length,
            detail: ok ? 'All INVOICE_CASH batches consistent' : rows.map(r =>
                `Batch ${r.batchNumber}: invoice ${r.orderNumber || r.referenceId} paidAmount=${r.paidAmount}`
            )
        };
    }

    async _inv12_noOrphanPayments() {
        const [rows] = await this.db.sequelize.query(`
            SELECT p.id, p."paymentNumber", p."partyType", p."partyId", p."partyName"
            FROM payments p
            WHERE p."isDeleted" = false
              AND p."partyId" IS NOT NULL
              AND p."partyType" = 'customer'
              AND NOT EXISTS (
                  SELECT 1 FROM customers c WHERE c.id = p."partyId"
              )
            LIMIT 100
        `);
        const [supplierRows] = await this.db.sequelize.query(`
            SELECT p.id, p."paymentNumber", p."partyType", p."partyId", p."partyName"
            FROM payments p
            WHERE p."isDeleted" = false
              AND p."partyId" IS NOT NULL
              AND p."partyType" = 'supplier'
              AND NOT EXISTS (
                  SELECT 1 FROM suppliers s WHERE s.id = p."partyId"
              )
            LIMIT 100
        `);
        const allOrphans = [...rows, ...supplierRows];
        const ok = allOrphans.length === 0;
        return {
            id: 'INV-12',
            name: 'No orphan payments (partyId references real entity)',
            status: ok ? 'PASS' : 'FAIL',
            severity: ok ? 'INFO' : 'CRITICAL',
            count: allOrphans.length,
            detail: ok ? 'No orphan payments' : allOrphans.map(r =>
                `Payment ${r.paymentNumber}: ${r.partyType} ${r.partyId} not found`
            )
        };
    }

    async _inv13_allocationVsInvoiceTotal() {
        let tableExists = false;
        try {
            const [r] = await this.db.sequelize.query(
                `SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_allocations'`
            );
            tableExists = r.length > 0;
        } catch (_) {}

        if (!tableExists) {
            return { id: 'INV-13', name: 'Allocation total ≤ invoice total', status: 'SKIP',
                severity: 'INFO', count: 0, detail: 'receipt_allocations table not found' };
        }

        const [rows] = await this.db.sequelize.query(`
            SELECT ra."orderId", o."orderNumber", o.total,
                   COALESCE(SUM(ra.amount), 0) AS alloc_total
            FROM receipt_allocations ra
            INNER JOIN orders o ON o.id = ra."orderId"
            WHERE ra."isDeleted" = false AND o."isDeleted" = false
            GROUP BY ra."orderId", o."orderNumber", o.total
            HAVING COALESCE(SUM(ra.amount), 0) > CAST(o.total AS NUMERIC) + ${TOLERANCE}
            LIMIT 100
        `);
        const ok = rows.length === 0;
        return {
            id: 'INV-13',
            name: 'Allocation total per invoice ≤ invoice total',
            status: ok ? 'PASS' : 'FAIL',
            severity: ok ? 'INFO' : 'CRITICAL',
            count: rows.length,
            detail: ok ? 'No over-allocated invoices' : rows.map(r =>
                `Invoice ${r.orderNumber}: allocated ${Number(r.alloc_total).toFixed(2)} > total ${Number(r.total).toFixed(2)}`
            )
        };
    }

    async _inv14_allocationVsPaymentTotal() {
        let tableExists = false;
        try {
            const [r] = await this.db.sequelize.query(
                `SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_allocations'`
            );
            tableExists = r.length > 0;
        } catch (_) {}

        if (!tableExists) {
            return { id: 'INV-14', name: 'Allocation total ≤ payment total', status: 'SKIP',
                severity: 'INFO', count: 0, detail: 'receipt_allocations table not found' };
        }

        const [rows] = await this.db.sequelize.query(`
            SELECT ra."paymentId", p."paymentNumber", p.amount,
                   COALESCE(SUM(ra.amount), 0) AS alloc_total
            FROM receipt_allocations ra
            INNER JOIN payments p ON p.id = ra."paymentId"
            WHERE ra."isDeleted" = false AND p."isDeleted" = false
            GROUP BY ra."paymentId", p."paymentNumber", p.amount
            HAVING COALESCE(SUM(ra.amount), 0) > CAST(p.amount AS NUMERIC) + ${TOLERANCE}
            LIMIT 100
        `);
        const ok = rows.length === 0;
        return {
            id: 'INV-14',
            name: 'Allocation total per payment ≤ payment amount',
            status: ok ? 'PASS' : 'FAIL',
            severity: ok ? 'INFO' : 'CRITICAL',
            count: rows.length,
            detail: ok ? 'No over-allocated payments' : rows.map(r =>
                `Payment ${r.paymentNumber}: allocated ${Number(r.alloc_total).toFixed(2)} > amount ${Number(r.amount).toFixed(2)}`
            )
        };
    }

    // ─── helpers ─────────────────────────────────────────────────────────────

    _summarise(results) {
        const counts = { PASS: 0, FAIL: 0, SKIP: 0, ERROR: 0 };
        const sevCounts = { INFO: 0, WARNING: 0, CRITICAL: 0, HALT: 0 };
        for (const r of results) {
            counts[r.status] = (counts[r.status] || 0) + 1;
            // Only count severity for failed/errored results — PASS results always carry 'INFO'
            // and including them inflates the INFO count without indicating a real issue.
            if (r.severity && r.status !== 'PASS' && r.status !== 'SKIP') {
                sevCounts[r.severity] = (sevCounts[r.severity] || 0) + 1;
            }
        }
        const overallStatus =
            sevCounts.HALT > 0     ? 'HALT' :
            sevCounts.CRITICAL > 0 ? 'CRITICAL' :
            sevCounts.WARNING > 0  ? 'WARNING' : 'OK';

        return { overallStatus, counts, sevCounts };
    }

    async _persist(report) {
        // Write to reconciliation_runs table (created by migration).
        // Silently skip if table doesn't exist yet.
        try {
            const { randomUUID } = require('crypto');
            const now = new Date();
            await this.db.sequelize.query(`
                INSERT INTO reconciliation_runs
                  (id, "triggeredBy", "startedAt", "finishedAt", "durationMs",
                   "overallStatus", "passCount", "failCount", "skipCount", "errorCount",
                   "haltCount", "criticalCount", "warningCount", results, "createdAt", "updatedAt")
                VALUES (:id, :triggeredBy, :startedAt, :finishedAt, :durationMs,
                        :overallStatus, :passCount, :failCount, :skipCount, :errorCount,
                        :haltCount, :criticalCount, :warningCount, :results, :createdAt, :updatedAt)
            `, {
                replacements: {
                    id: randomUUID(),
                    triggeredBy: report.triggeredBy,
                    startedAt: report.startedAt,
                    finishedAt: report.finishedAt,
                    durationMs: report.durationMs,
                    overallStatus: report.summary.overallStatus,
                    passCount: report.summary.counts.PASS || 0,
                    failCount: report.summary.counts.FAIL || 0,
                    skipCount: report.summary.counts.SKIP || 0,
                    errorCount: report.summary.counts.ERROR || 0,
                    haltCount: report.summary.sevCounts.HALT || 0,
                    criticalCount: report.summary.sevCounts.CRITICAL || 0,
                    warningCount: report.summary.sevCounts.WARNING || 0,
                    results: JSON.stringify(report.results),
                    createdAt: now,
                    updatedAt: now
                }
            });
        } catch (e) {
            if (!e.message.includes('does not exist')) throw e;
        }
    }

    _log(report) {
        const { overallStatus, counts, sevCounts } = report.summary;
        const prefix = overallStatus === 'OK' ? '[AUDIT OK]' :
                       overallStatus === 'WARNING' ? '[AUDIT WARN]' :
                       `[AUDIT ${overallStatus}]`;

        console.log(`${prefix} ${report.triggeredBy} run completed in ${report.durationMs}ms`);
        console.log(`  PASS=${counts.PASS} FAIL=${counts.FAIL} SKIP=${counts.SKIP} ERROR=${counts.ERROR}`);
        const failed = report.results.filter(x => x.status === 'FAIL');
        for (const r of failed) {
            const log = r.severity === 'HALT' || r.severity === 'CRITICAL' ? console.error : console.warn;
            log(`  [${r.severity}] ${r.id} ${r.name}: ${r.count} violation(s)`);
            if (Array.isArray(r.detail)) r.detail.slice(0, 5).forEach(d => log(`    → ${d}`));
        }
    }
}

module.exports = SelfAuditService;
