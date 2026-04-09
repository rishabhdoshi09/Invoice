/**
 * One-time backfill script — run once to fix the two CRITICAL audit alerts:
 *
 * 1. INV-09: Old invoices (created before the accounting engine was set up)
 *    that have no INVOICE journal batch. We post them now using the live
 *    accounting engine, so they show up in the ledger going forward.
 *
 * 2. INV-12: Orphan payment PAY-DDA0E361 whose supplier no longer exists.
 *    We soft-delete it so it stops appearing in audit reports.
 *
 * Usage (from Invoice/backend/):
 *   node scripts/backfill-journals.js
 */

'use strict';

require('dotenv').config();

// Satisfy startup env check
process.env.JWT_SECRET = process.env.JWT_SECRET || 'backfill-script-placeholder-not-used';

const db = require('../src/models');
const { postSalesInvoice } = require('../src/services/accountingEngine');

async function main() {
    await db.sequelize.authenticate();
    console.log('DB connected.\n');

    // ── 1. Fix orphan payment ─────────────────────────────────────────────────
    console.log('=== Fixing orphan payment PAY-DDA0E361 ===');
    const [updatedRows] = await db.payment.update(
        { isDeleted: true },
        { where: { paymentNumber: 'PAY-DDA0E361', isDeleted: false } }
    );
    console.log(`Soft-deleted ${updatedRows} row(s).\n`);

    // ── 2. Backfill INVOICE journal batches for old orders ────────────────────
    console.log('=== Backfilling missing INVOICE journal batches ===');

    // Find all non-deleted orders that have no INVOICE journal batch
    const [unpostedOrders] = await db.sequelize.query(`
        SELECT o.id, o."orderNumber", o."customerName", o."customerId",
               o.total, o.cgst, o.sgst, o.igst, o."orderDate", o."createdAt"
        FROM orders o
        WHERE o."isDeleted" = false
          AND NOT EXISTS (
              SELECT 1 FROM journal_batches jb
              WHERE jb."referenceId" = o.id
                AND jb."referenceType" = 'INVOICE'
                AND jb."isReversed" = false
          )
        ORDER BY o."createdAt" ASC
    `);

    console.log(`Found ${unpostedOrders.length} unposted order(s).`);

    if (unpostedOrders.length === 0) {
        console.log('Nothing to backfill.');
    } else {
        let posted = 0, skipped = 0, failed = 0;

        for (const order of unpostedOrders) {
            if (!order.total || Number(order.total) <= 0) {
                console.log(`  SKIP ${order.orderNumber} — zero total`);
                skipped++;
                continue;
            }

            try {
                await db.sequelize.transaction(async (t) => {
                    const result = await postSalesInvoice(order, t);
                    if (result?.skipped) {
                        console.log(`  SKIP ${order.orderNumber} — ${result.reason || result.batchNumber}`);
                        skipped++;
                    } else {
                        console.log(`  POST ${order.orderNumber} → ${result?.batchNumber}`);
                        posted++;
                    }
                });
            } catch (err) {
                console.error(`  FAIL ${order.orderNumber} — ${err.message}`);
                failed++;
            }
        }

        console.log(`\nDone: ${posted} posted, ${skipped} skipped, ${failed} failed.`);
    }

    await db.sequelize.close();
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
