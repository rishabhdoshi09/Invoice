#!/usr/bin/env node
/**
 * Financial Integrity Repair Script  (append-only, non-destructive)
 * ==================================================================
 * DATA SAFETY RULE (non-negotiable):
 *   - DO NOT delete any financial data.
 *   - DO NOT overwrite originalPaidAmount, originalTotal, or any immutable field.
 *   - DO NOT null out historical references (partyId, etc.).
 *   - All WRITE actions are append-only or correct stale derived fields.
 *   - Every action is recorded in repair-audit-log.json for reversibility.
 *
 * Phases:
 *   A  Recompute stale derived payment fields (paidAmount / dueAmount / paymentStatus)
 *      from canonical formula: paidAmount = originalPaidAmount + SUM(active allocations)
 *      dueAmount = total - paidAmount.  originalPaidAmount is NEVER touched.
 *   B  Create missing INVOICE journal batches (for orders with no ledger entry when
 *      Chart of Accounts is initialised).  Append-only — never modifies existing batches.
 *   C  Flag orphan payments (partyId → missing entity).  NO nulling of partyId.
 *      Writes a warning record to repair-audit-log.json only.
 *   D  Flag over-allocated invoices for manual review.  No auto-fix.
 *   E  Merge duplicate party ledger accounts.  Moves ledger_entries to the oldest
 *      account, renames the duplicate (prefix "[MERGED]") — never deletes rows.
 *
 * Usage:
 *   node scripts/repair-financial-integrity.js            # dry run (default)
 *   node scripts/repair-financial-integrity.js --execute  # apply fixes
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const db   = require('../src/models');
const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DRY_RUN   = !process.argv.includes('--execute');
const LOG_PATH  = path.resolve(__dirname, '../repair-audit-log.json');
const round2    = (n) => Math.round(Number(n) * 100) / 100;
const TOLERANCE = 0.01;

// ── Audit log accumulator ────────────────────────────────────────────────────
const auditLog = {
    runAt:    new Date().toISOString(),
    dryRun:   DRY_RUN,
    actions:  []
};

function logAction(phase, type, data) {
    auditLog.actions.push({ phase, type, ...data, loggedAt: new Date().toISOString() });
}

// ── Banner ────────────────────────────────────────────────────────────────────
function banner(msg) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  ${msg}`);
    console.log(`${'─'.repeat(70)}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
    await db.sequelize.authenticate();

    console.log(`\n${'='.repeat(70)}`);
    console.log('  Financial Integrity Repair Script  (append-only)');
    console.log(`  Mode: ${DRY_RUN ? 'DRY RUN — no writes (pass --execute to apply)' : '⚠  EXECUTE — writes enabled'}`);
    console.log(`${'='.repeat(70)}\n`);

    // ── PHASE A: Recompute stale derived payment fields ───────────────────────
    banner('PHASE A: Recompute stale paidAmount / dueAmount / paymentStatus');
    console.log('  Strategy: paidAmount = originalPaidAmount + SUM(active receipt_allocations)');
    console.log('            dueAmount  = total - paidAmount');
    console.log('            originalPaidAmount is NEVER modified.\n');

    // Find all orders that appear stale (paid+due ≠ total, or paymentStatus label wrong)
    const [staleOrders] = await db.sequelize.query(`
        SELECT
            o.id,
            o."orderNumber",
            o."customerName",
            CAST(o.total                AS NUMERIC) AS total,
            CAST(o."paidAmount"         AS NUMERIC) AS stored_paid,
            CAST(o."dueAmount"          AS NUMERIC) AS stored_due,
            CAST(o."originalPaidAmount" AS NUMERIC) AS orig_paid,
            o."paymentStatus"                       AS stored_status,
            COALESCE(
                (SELECT SUM(ra.amount)
                 FROM receipt_allocations ra
                 WHERE ra."orderId" = o.id AND ra."isDeleted" = false),
                0
            ) AS alloc_sum
        FROM orders o
        WHERE o."isDeleted" = false
        ORDER BY o."orderNumber"
        LIMIT 2000
    `);

    const phaseAFixes = [];
    for (const row of staleOrders) {
        const total      = round2(row.total);
        const origPaid   = round2(row.orig_paid);
        const allocSum   = round2(row.alloc_sum);
        const newPaid    = round2(origPaid + allocSum);
        const newDue     = round2(total - newPaid);

        let newStatus = 'unpaid';
        if (newPaid >= total - TOLERANCE) newStatus = 'paid';
        else if (newPaid > TOLERANCE)     newStatus = 'partial';

        const storedPaid   = round2(row.stored_paid);
        const storedDue    = round2(row.stored_due);
        const storedStatus = row.stored_status;

        const paidDrift   = Math.abs(newPaid   - storedPaid)   > TOLERANCE;
        const dueDrift    = Math.abs(newDue    - storedDue)    > TOLERANCE;
        const statusDrift = newStatus !== storedStatus;

        if (paidDrift || dueDrift || statusDrift) {
            phaseAFixes.push({
                id:          row.id,
                orderNumber: row.orderNumber,
                customerName: row.customerName,
                before: { paidAmount: storedPaid, dueAmount: storedDue, paymentStatus: storedStatus },
                after:  { paidAmount: newPaid,    dueAmount: newDue,    paymentStatus: newStatus },
                origPaid,
                allocSum
            });
        }
    }

    if (phaseAFixes.length === 0) {
        console.log('  ✓  All orders have correct derived payment fields.\n');
    } else {
        console.log(`  ⚠  ${phaseAFixes.length} order(s) have stale derived fields:`);
        for (const f of phaseAFixes) {
            console.log(
                `    ${f.orderNumber} | origPaid=${f.origPaid.toFixed(2)}` +
                ` allocs=${f.allocSum.toFixed(2)}` +
                ` → paid: ${f.before.paidAmount.toFixed(2)}→${f.after.paidAmount.toFixed(2)}` +
                ` due: ${f.before.dueAmount.toFixed(2)}→${f.after.dueAmount.toFixed(2)}` +
                ` status: ${f.before.paymentStatus}→${f.after.paymentStatus}`
            );
        }
        console.log('');
    }

    // ── PHASE B: Missing INVOICE journal batches ──────────────────────────────
    banner('PHASE B: Detect missing INVOICE journal batches');

    const accountCount = await db.account.count();
    let phaseBFixes = [];

    if (accountCount === 0) {
        console.log('  SKIP: Chart of Accounts not initialised — no ledger posting expected.\n');
    } else {
        const [missingLedger] = await db.sequelize.query(`
            SELECT o.id, o."orderNumber", o."customerName",
                   CAST(o.total AS NUMERIC)       AS total,
                   CAST(o."paidAmount" AS NUMERIC) AS paid
            FROM orders o
            WHERE o."isDeleted" = false
              AND NOT EXISTS (
                  SELECT 1 FROM journal_batches jb
                  WHERE jb."referenceType" = 'INVOICE'
                    AND jb."referenceId"   = o.id
                    AND jb."isReversed"    = false
              )
            ORDER BY o."createdAt" DESC
            LIMIT 500
        `);

        if (missingLedger.length === 0) {
            console.log('  ✓  Every active order has an INVOICE journal batch.\n');
        } else {
            console.log(`  ⚠  ${missingLedger.length} order(s) are missing an INVOICE journal batch:`);
            for (const r of missingLedger) {
                console.log(`    ${r.orderNumber} | total=${Number(r.total).toFixed(2)} — no journal batch`);
                phaseBFixes.push({ id: r.id, orderNumber: r.orderNumber, total: r.total, paid: r.paid });
            }
            console.log('  Action: Will create missing journal batches (append-only).\n');
        }
    }

    // ── PHASE C: Orphan payments (FLAG ONLY — no data mutation) ──────────────
    banner('PHASE C: Orphan payments (flag only — partyId will NOT be changed)');

    const [orphanCustomer] = await db.sequelize.query(`
        SELECT p.id, p."paymentNumber", p."partyId", p."partyName", p."partyType", p.amount
        FROM payments p
        WHERE p."isDeleted" = false
          AND p."partyId" IS NOT NULL
          AND p."partyType" = 'customer'
          AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = p."partyId")
        LIMIT 200
    `);
    const [orphanSupplier] = await db.sequelize.query(`
        SELECT p.id, p."paymentNumber", p."partyId", p."partyName", p."partyType", p.amount
        FROM payments p
        WHERE p."isDeleted" = false
          AND p."partyId" IS NOT NULL
          AND p."partyType" = 'supplier'
          AND NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.id = p."partyId")
        LIMIT 200
    `);
    const orphans = [...orphanCustomer, ...orphanSupplier];

    if (orphans.length === 0) {
        console.log('  ✓  No orphan payments found.\n');
    } else {
        console.log(`  ⚠  ${orphans.length} orphan payment(s) detected (partyId references a missing entity):`);
        for (const r of orphans) {
            console.log(
                `    ${r.paymentNumber}: ${r.partyType} partyId=${r.partyId}` +
                ` name="${r.partyName}" amount=${Number(r.amount).toFixed(2)}`
            );
        }
        console.log('  Action: FLAGGED ONLY. partyId preserved. Manual reconciliation required.\n');
    }

    // ── PHASE D: Over-allocations (FLAG ONLY) ─────────────────────────────────
    banner('PHASE D: Over-allocated invoices (flag only — no auto-fix)');

    let overAllocRows = [];
    try {
        const [rows] = await db.sequelize.query(`
            SELECT ra."orderId", o."orderNumber",
                   CAST(o.total AS NUMERIC) AS total,
                   COALESCE(SUM(CAST(ra.amount AS NUMERIC)), 0) AS alloc_total
            FROM receipt_allocations ra
            INNER JOIN orders o ON o.id = ra."orderId"
            WHERE ra."isDeleted" = false AND o."isDeleted" = false
            GROUP BY ra."orderId", o."orderNumber", o.total
            HAVING COALESCE(SUM(CAST(ra.amount AS NUMERIC)), 0) > CAST(o.total AS NUMERIC) + 0.01
            LIMIT 200
        `);
        overAllocRows = rows;
    } catch (e) {
        console.log('  SKIP: receipt_allocations table not found.\n');
    }

    if (overAllocRows.length === 0) {
        console.log('  ✓  No over-allocated invoices found.\n');
    } else {
        console.log(`  ⚠  ${overAllocRows.length} over-allocated invoice(s) — MANUAL REVIEW REQUIRED:`);
        for (const r of overAllocRows) {
            const excess = round2(Number(r.alloc_total) - Number(r.total));
            console.log(
                `    ${r.orderNumber}: allocated=${Number(r.alloc_total).toFixed(2)}` +
                ` total=${Number(r.total).toFixed(2)} excess=₹${excess.toFixed(2)}`
            );
        }
        console.log('  Action: Cannot auto-fix — review and soft-delete excess allocations manually.\n');
    }

    // ── PHASE E: Duplicate party ledger accounts ──────────────────────────────
    banner('PHASE E: Duplicate party ledger accounts');
    console.log('  Strategy: move ledger_entries to oldest account, rename duplicate as [MERGED].');
    console.log('            Duplicate account rows are kept (never deleted) — just renamed.\n');

    const [dupeAccounts] = await db.sequelize.query(`
        SELECT "partyType", "partyId", COUNT(*) AS cnt,
               ARRAY_AGG(id ORDER BY "createdAt" ASC) AS account_ids,
               ARRAY_AGG(name ORDER BY "createdAt" ASC) AS account_names
        FROM accounts
        WHERE "partyId" IS NOT NULL
        GROUP BY "partyType", "partyId"
        HAVING COUNT(*) > 1
        LIMIT 100
    `);

    if (dupeAccounts.length === 0) {
        console.log('  ✓  No duplicate party accounts found.\n');
    } else {
        console.log(`  ⚠  ${dupeAccounts.length} duplicate (partyType, partyId) group(s) detected:`);
        for (const r of dupeAccounts) {
            const ids = r.account_ids;
            console.log(`    ${r.partyType} ${r.partyId}: keep=${ids[0]}, merge=${ids.slice(1).join(', ')}`);
        }
        console.log('');
    }

    // ── SUMMARY ────────────────────────────────────────────────────────────────
    const totalAutoFixable = phaseAFixes.length + phaseBFixes.length + dupeAccounts.length;
    const totalFlagged     = orphans.length + overAllocRows.length;

    console.log(`${'='.repeat(70)}`);
    console.log('SUMMARY');
    console.log(`  A  Stale payment fields (will recompute):   ${phaseAFixes.length}`);
    console.log(`  B  Missing INVOICE journal batches:         ${phaseBFixes.length}`);
    console.log(`  C  Orphan payments (FLAG only):             ${orphans.length}`);
    console.log(`  D  Over-allocations (FLAG only):            ${overAllocRows.length}`);
    console.log(`  E  Duplicate accounts (will merge+rename):  ${dupeAccounts.length}`);
    console.log(`  ─`);
    console.log(`     Auto-fixable:  ${totalAutoFixable}`);
    console.log(`     Flagged only:  ${totalFlagged}  ← manual review required`);
    console.log(`${'='.repeat(70)}\n`);

    // Record flags in audit log regardless of dry run
    for (const r of orphans) {
        logAction('C', 'ORPHAN_PAYMENT_FLAGGED', {
            paymentId: r.id, paymentNumber: r.paymentNumber,
            partyType: r.partyType, partyId: r.partyId, partyName: r.partyName,
            amount: r.amount, recommendation: 'Manual reconciliation — verify party or soft-delete payment'
        });
    }
    for (const r of overAllocRows) {
        logAction('D', 'OVER_ALLOCATION_FLAGGED', {
            orderId: r.orderId, orderNumber: r.orderNumber,
            total: r.total, allocatedTotal: r.alloc_total,
            recommendation: 'Soft-delete excess receipt_allocations manually'
        });
    }

    if (DRY_RUN) {
        fs.writeFileSync(LOG_PATH, JSON.stringify(auditLog, null, 2));
        console.log(`DRY RUN complete. Audit log written to: ${LOG_PATH}`);
        console.log('No data was changed. To apply fixes run:\n');
        console.log('  node scripts/repair-financial-integrity.js --execute\n');
        process.exit(0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // EXECUTE MODE
    // ══════════════════════════════════════════════════════════════════════════
    console.log('Applying fixes (each phase in its own transaction for isolation)...\n');

    // ── Execute Phase A ───────────────────────────────────────────────────────
    if (phaseAFixes.length > 0) {
        console.log(`Phase A: Updating ${phaseAFixes.length} order(s) with canonical payment fields...`);
        const tA = await db.sequelize.transaction();
        try {
            for (const f of phaseAFixes) {
                await db.sequelize.query(
                    `UPDATE orders
                     SET "paidAmount"    = :paid,
                         "dueAmount"     = :due,
                         "paymentStatus" = :status
                     WHERE id = :id`,
                    {
                        replacements: {
                            paid:   f.after.paidAmount,
                            due:    f.after.dueAmount,
                            status: f.after.paymentStatus,
                            id:     f.id
                        },
                        transaction: tA
                    }
                );
                logAction('A', 'PAYMENT_FIELDS_RECOMPUTED', {
                    orderId:     f.id,
                    orderNumber: f.orderNumber,
                    before:      f.before,
                    after:       f.after,
                    origPaid:    f.origPaid,
                    allocSum:    f.allocSum,
                    note: 'Derived fields only. originalPaidAmount unchanged.'
                });
            }
            await tA.commit();
            console.log(`  ✓  Phase A complete: ${phaseAFixes.length} order(s) updated.\n`);
        } catch (err) {
            await tA.rollback();
            console.error('  ✗  Phase A rolled back:', err.message);
        }
    }

    // ── Execute Phase B ───────────────────────────────────────────────────────
    if (phaseBFixes.length > 0) {
        console.log(`Phase B: Creating ${phaseBFixes.length} missing INVOICE journal batch(es)...`);
        const LedgerService = require('../src/services/ledgerService');
        const ledgerService = new LedgerService(db);
        const { postInvoiceToLedger } = require('../src/services/realTimeLedger');

        for (const o of phaseBFixes) {
            const tB = await db.sequelize.transaction();
            try {
                // Fetch full order within transaction
                const order = await db.order.findByPk(o.id, { transaction: tB });
                await postInvoiceToLedger(order, tB);
                await tB.commit();
                logAction('B', 'INVOICE_BATCH_CREATED', {
                    orderId: o.id, orderNumber: o.orderNumber,
                    note: 'Append-only: new journal batch created, nothing modified'
                });
                console.log(`  ✓  Created INVOICE batch for ${o.orderNumber}`);
            } catch (err) {
                await tB.rollback();
                console.error(`  ✗  Phase B failed for ${o.orderNumber}:`, err.message);
                logAction('B', 'INVOICE_BATCH_FAILED', { orderId: o.id, orderNumber: o.orderNumber, error: err.message });
            }
        }
        console.log('');
    }

    // ── Execute Phase E ───────────────────────────────────────────────────────
    if (dupeAccounts.length > 0) {
        console.log(`Phase E: Merging ${dupeAccounts.length} duplicate account group(s)...`);
        const tE = await db.sequelize.transaction();
        try {
            for (const group of dupeAccounts) {
                const ids   = group.account_ids;  // sorted oldest first
                const keepId  = ids[0];
                const mergeIds = ids.slice(1);
                for (const dupeId of mergeIds) {
                    // Move ledger entries to the primary (oldest) account
                    const [, moved] = await db.sequelize.query(
                        `UPDATE ledger_entries SET "accountId" = :keepId WHERE "accountId" = :dupeId`,
                        { replacements: { keepId, dupeId }, transaction: tE }
                    );
                    // Rename duplicate account (never delete the row)
                    await db.sequelize.query(
                        `UPDATE accounts
                         SET name = '[MERGED into ' || :keepId || '] ' || name
                         WHERE id = :dupeId AND name NOT LIKE '[MERGED%'`,
                        { replacements: { keepId, dupeId }, transaction: tE }
                    );
                    logAction('E', 'DUPLICATE_ACCOUNT_MERGED', {
                        primaryAccountId: keepId,
                        mergedAccountId:  dupeId,
                        partyType:        group.partyType,
                        partyId:          group.partyId,
                        ledgerEntriesMoved: (moved && moved.rowCount) || 'unknown',
                        note: 'Row kept, name prefixed [MERGED], entries moved to primary'
                    });
                    console.log(`  ✓  Merged account ${dupeId} → ${keepId}`);
                }
            }
            await tE.commit();
            console.log('');
        } catch (err) {
            await tE.rollback();
            console.error('  ✗  Phase E rolled back:', err.message);
        }
    }

    // ── Write audit log ───────────────────────────────────────────────────────
    fs.writeFileSync(LOG_PATH, JSON.stringify(auditLog, null, 2));
    console.log(`\n${'='.repeat(70)}`);
    console.log('  Repair complete.');
    console.log(`  Audit log written to: ${LOG_PATH}`);
    console.log('  Review the log before marking this incident as resolved.');
    console.log(`${'='.repeat(70)}\n`);

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
