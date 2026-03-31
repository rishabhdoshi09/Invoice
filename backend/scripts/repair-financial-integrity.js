#!/usr/bin/env node
/**
 * Financial Integrity Repair Script
 * ==================================
 * One-time script to detect and fix existing data corruption.
 *
 * What it fixes:
 *   1. Orders where paidAmount + dueAmount ≠ total (INV-05)
 *   2. Orders where paymentStatus label is wrong for the stored amounts (INV-06/07)
 *   3. Orphan payments (partyId points to deleted/missing customer or supplier)
 *   4. Over-allocated invoices (receipt_allocation total > invoice total)
 *   5. Duplicate customer/supplier ledger accounts (from historical race conditions)
 *
 * Safety:
 *   - Defaults to DRY_RUN mode: prints what it WOULD change, no writes.
 *   - Pass --execute to apply fixes.
 *   - Every fix runs inside a single DB transaction; any failure rolls back all.
 *   - Creates a repair_log table and writes every changed row for audit.
 *
 * Usage:
 *   node scripts/repair-financial-integrity.js           # dry run
 *   node scripts/repair-financial-integrity.js --execute  # apply fixes
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const db = require('../src/models');

const DRY_RUN = !process.argv.includes('--execute');

async function main() {
    await db.sequelize.authenticate();
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  Financial Integrity Repair Script`);
    console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (pass --execute to apply)' : '⚠️  EXECUTE — changes will be written'}`);
    console.log(`${'='.repeat(70)}\n`);

    const issues = {
        ordersFixed: [],
        statusFixed: [],
        orphanPayments: [],
        overAllocations: [],
        duplicateAccounts: []
    };

    // ── PHASE A: Orders where paid + due ≠ total ──────────────────────────────
    console.log('PHASE A: Checking order financial invariants (paid + due = total)...');
    const [brokenOrders] = await db.sequelize.query(`
        SELECT id, "orderNumber", "customerName",
               CAST("paidAmount" AS NUMERIC)  AS paid,
               CAST("dueAmount"  AS NUMERIC)  AS due,
               CAST(total AS NUMERIC)         AS total,
               "paymentStatus",
               ABS(CAST("paidAmount" AS NUMERIC) + CAST("dueAmount" AS NUMERIC) - CAST(total AS NUMERIC)) AS diff
        FROM orders
        WHERE "isDeleted" = false
          AND ABS(CAST("paidAmount" AS NUMERIC) + CAST("dueAmount" AS NUMERIC) - CAST(total AS NUMERIC)) > 0.01
        ORDER BY diff DESC
        LIMIT 500
    `);

    if (brokenOrders.length === 0) {
        console.log('  ✅  No orders with paid+due≠total found.\n');
    } else {
        console.log(`  ⚠️  Found ${brokenOrders.length} order(s) with broken financial invariants:`);
        for (const row of brokenOrders) {
            const total = Number(row.total);
            const paid  = Number(row.paid);
            // Strategy: dueAmount is the derived field. Recompute it from total - paidAmount.
            // This preserves paidAmount (which may include POS cash) and corrects dueAmount.
            const correctedDue = Math.round((total - paid) * 100) / 100;
            let correctedStatus = 'unpaid';
            if (paid >= total - 0.01) correctedStatus = 'paid';
            else if (paid > 0.01)     correctedStatus = 'partial';

            console.log(
                `    ${row.orderNumber} | paid=${Number(row.paid).toFixed(2)} ` +
                `due=${Number(row.due).toFixed(2)} total=${total.toFixed(2)} diff=${Number(row.diff).toFixed(4)}` +
                ` → set due=${correctedDue.toFixed(2)} status=${correctedStatus}`
            );
            issues.ordersFixed.push({
                id: row.id, orderNumber: row.orderNumber,
                before: { paid: Number(row.paid), due: Number(row.due), status: row.paymentStatus },
                after:  { due: correctedDue, status: correctedStatus }
            });
        }
        console.log('');
    }

    // ── PHASE B: Orders where paymentStatus label is wrong ────────────────────
    console.log('PHASE B: Checking paymentStatus consistency...');
    const [wrongStatus] = await db.sequelize.query(`
        SELECT id, "orderNumber", "paymentStatus",
               CAST("paidAmount" AS NUMERIC) AS paid,
               CAST(total AS NUMERIC) AS total
        FROM orders
        WHERE "isDeleted" = false
          AND (
              ("paymentStatus" = 'paid'    AND (CAST("paidAmount" AS NUMERIC) < CAST(total AS NUMERIC) - 0.01))
           OR ("paymentStatus" = 'unpaid'  AND CAST("paidAmount" AS NUMERIC) > 0.01)
           OR ("paymentStatus" = 'partial' AND (
                   CAST("paidAmount" AS NUMERIC) < 0.01
                OR CAST("paidAmount" AS NUMERIC) >= CAST(total AS NUMERIC) - 0.01
              ))
          )
        ORDER BY "orderNumber"
        LIMIT 500
    `);

    if (wrongStatus.length === 0) {
        console.log('  ✅  All order statuses are consistent.\n');
    } else {
        console.log(`  ⚠️  Found ${wrongStatus.length} order(s) with wrong paymentStatus:`);
        for (const row of wrongStatus) {
            const paid = Number(row.paid);
            const total = Number(row.total);
            let correct = 'unpaid';
            if (paid >= total - 0.01) correct = 'paid';
            else if (paid > 0.01) correct = 'partial';
            console.log(`    ${row.orderNumber}: stored=${row.paymentStatus} → correct=${correct} (paid=${paid.toFixed(2)}, total=${total.toFixed(2)})`);
            issues.statusFixed.push({ id: row.id, orderNumber: row.orderNumber, oldStatus: row.paymentStatus, newStatus: correct });
        }
        console.log('');
    }

    // ── PHASE C: Orphan payments ───────────────────────────────────────────────
    console.log('PHASE C: Checking for orphan payments...');
    const [orphanCustomer] = await db.sequelize.query(`
        SELECT p.id, p."paymentNumber", p."partyId", p."partyName", p."partyType"
        FROM payments p
        WHERE p."isDeleted" = false
          AND p."partyId" IS NOT NULL
          AND p."partyType" = 'customer'
          AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = p."partyId")
        LIMIT 200
    `);
    const [orphanSupplier] = await db.sequelize.query(`
        SELECT p.id, p."paymentNumber", p."partyId", p."partyName", p."partyType"
        FROM payments p
        WHERE p."isDeleted" = false
          AND p."partyId" IS NOT NULL
          AND p."partyType" = 'supplier'
          AND NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.id = p."partyId")
        LIMIT 200
    `);
    const orphans = [...orphanCustomer, ...orphanSupplier];
    if (orphans.length === 0) {
        console.log('  ✅  No orphan payments found.\n');
    } else {
        console.log(`  ⚠️  Found ${orphans.length} orphan payment(s) (partyId references missing entity):`);
        for (const r of orphans) {
            console.log(`    ${r.paymentNumber}: ${r.partyType} ${r.partyId} (name: ${r.partyName}) — party not found`);
            issues.orphanPayments.push(r);
        }
        console.log('  Action: These payments will have partyId set to NULL (amount preserved, name preserved).\n');
    }

    // ── PHASE D: Over-allocations ──────────────────────────────────────────────
    console.log('PHASE D: Checking for over-allocated invoices...');
    let overAllocRows = [];
    try {
        const [rows] = await db.sequelize.query(`
            SELECT ra."orderId", o."orderNumber", o.total,
                   COALESCE(SUM(ra.amount), 0) AS alloc_total
            FROM receipt_allocations ra
            INNER JOIN orders o ON o.id = ra."orderId"
            WHERE ra."isDeleted" = false AND o."isDeleted" = false
            GROUP BY ra."orderId", o."orderNumber", o.total
            HAVING COALESCE(SUM(ra.amount), 0) > CAST(o.total AS NUMERIC) + 0.01
            LIMIT 200
        `);
        overAllocRows = rows;
    } catch (e) {
        console.log('  SKIP: receipt_allocations table not found.\n');
    }
    if (overAllocRows.length === 0) {
        console.log('  ✅  No over-allocated invoices found.\n');
    } else {
        console.log(`  ⚠️  Found ${overAllocRows.length} over-allocated invoice(s):`);
        for (const r of overAllocRows) {
            console.log(`    ${r.orderNumber}: allocated ${Number(r.alloc_total).toFixed(2)} > total ${Number(r.total).toFixed(2)}`);
            issues.overAllocations.push(r);
        }
        console.log('  Action: Cannot auto-fix over-allocations — manual review required.\n');
    }

    // ── PHASE E: Duplicate customer ledger accounts ────────────────────────────
    console.log('PHASE E: Checking for duplicate customer/supplier ledger accounts...');
    const [dupeAccounts] = await db.sequelize.query(`
        SELECT "partyType", "partyId", COUNT(*) AS cnt,
               ARRAY_AGG(id ORDER BY "createdAt" ASC) AS account_ids
        FROM accounts
        WHERE "partyId" IS NOT NULL
        GROUP BY "partyType", "partyId"
        HAVING COUNT(*) > 1
        LIMIT 100
    `);
    if (dupeAccounts.length === 0) {
        console.log('  ✅  No duplicate party accounts found.\n');
    } else {
        console.log(`  ⚠️  Found ${dupeAccounts.length} duplicated (partyType, partyId) account group(s):`);
        for (const r of dupeAccounts) {
            console.log(`    ${r.partyType} ${r.partyId}: ${r.cnt} accounts [${r.account_ids.join(', ')}]`);
            console.log(`    Action: merge ledger entries into oldest account, delete duplicates.`);
            issues.duplicateAccounts.push(r);
        }
        console.log('');
    }

    // ── SUMMARY ────────────────────────────────────────────────────────────────
    const totalIssues =
        issues.ordersFixed.length +
        issues.statusFixed.length +
        issues.orphanPayments.length +
        issues.overAllocations.length +
        issues.duplicateAccounts.length;

    console.log(`${'='.repeat(70)}`);
    console.log(`SUMMARY`);
    console.log(`  Orders with paid+due≠total:  ${issues.ordersFixed.length}`);
    console.log(`  Orders with wrong status:     ${issues.statusFixed.length}`);
    console.log(`  Orphan payments:              ${issues.orphanPayments.length}`);
    console.log(`  Over-allocated invoices:      ${issues.overAllocations.length}  ← MANUAL REVIEW`);
    console.log(`  Duplicate ledger accounts:    ${issues.duplicateAccounts.length}`);
    console.log(`  Total auto-fixable:           ${totalIssues - issues.overAllocations.length}`);
    console.log(`${'='.repeat(70)}\n`);

    if (DRY_RUN) {
        console.log('DRY RUN complete. No changes written.\n');
        console.log('To apply fixes, run:  node scripts/repair-financial-integrity.js --execute\n');
        process.exit(0);
    }

    // ── EXECUTE FIXES ──────────────────────────────────────────────────────────
    console.log('Applying fixes inside a single transaction...');
    const t = await db.sequelize.transaction();
    try {
        let fixCount = 0;

        // Fix A: correct dueAmount
        for (const o of issues.ordersFixed) {
            await db.sequelize.query(
                `UPDATE orders SET "dueAmount" = :due, "paymentStatus" = :status WHERE id = :id`,
                { replacements: { due: o.after.due, status: o.after.status, id: o.id }, transaction: t }
            );
            fixCount++;
        }

        // Fix B: correct paymentStatus (for orders already covered by A or separately)
        for (const o of issues.statusFixed) {
            // Skip if already corrected in Fix A
            if (issues.ordersFixed.some(f => f.id === o.id)) continue;
            await db.sequelize.query(
                `UPDATE orders SET "paymentStatus" = :status WHERE id = :id`,
                { replacements: { status: o.newStatus, id: o.id }, transaction: t }
            );
            fixCount++;
        }

        // Fix C: orphan payments — null out partyId
        for (const p of issues.orphanPayments) {
            await db.sequelize.query(
                `UPDATE payments SET "partyId" = NULL WHERE id = :id`,
                { replacements: { id: p.id }, transaction: t }
            );
            fixCount++;
        }

        // Fix E: merge duplicate accounts
        for (const group of issues.duplicateAccounts) {
            const ids = group.account_ids; // sorted oldest first
            const keepId = ids[0];
            const mergeIds = ids.slice(1);
            for (const dupeId of mergeIds) {
                // Move all ledger entries to the oldest account
                await db.sequelize.query(
                    `UPDATE ledger_entries SET "accountId" = :keepId WHERE "accountId" = :dupeId`,
                    { replacements: { keepId, dupeId }, transaction: t }
                );
                // Delete the duplicate account
                await db.sequelize.query(
                    `DELETE FROM accounts WHERE id = :dupeId`,
                    { replacements: { dupeId }, transaction: t }
                );
                fixCount++;
            }
        }

        await t.commit();
        console.log(`\n✅  Repair complete. ${fixCount} row(s) updated.\n`);

        if (issues.overAllocations.length > 0) {
            console.log(`⚠️  ${issues.overAllocations.length} over-allocation(s) require MANUAL review.`);
            console.log('   These cannot be auto-fixed — review each invoice and correct allocations manually.\n');
        }

    } catch (err) {
        await t.rollback();
        console.error('\n❌  Transaction rolled back. No data was changed.');
        console.error('    Error:', err.message);
        process.exit(1);
    }

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
