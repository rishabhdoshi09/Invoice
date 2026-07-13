/**
 * One-time repair script for the two remaining self-audit findings:
 *
 * 1. INV-09 (CRITICAL): linked invoices with no INVOICE journal batch
 *    (e.g. INV/2026-27/3547, 3548 — created while ledger posting failed).
 *    Re-posts them through the live accounting engine, including the
 *    INVOICE_CASH batch when POS cash was recorded.
 *
 * 2. INV-11 (WARNING): INVOICE_CASH batches still standing on invoices whose
 *    paidAmount is 0 (historical paid→unpaid toggles zeroed paidAmount
 *    without reversing the cash batch — the toggle path now does this
 *    automatically). Posts proper mirror reversal batches and marks the
 *    originals reversed, so DR=CR stays intact and the audit clears.
 *
 * Safe to re-run: each fix is idempotent (already-posted / already-reversed
 * items are skipped), and each item runs in its own transaction so one
 * failure doesn't block the rest.
 *
 * Usage (from Invoice/backend/):
 *   node scripts/repair-audit-inv09-inv11.js
 */

'use strict';

require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'repair-script-placeholder-not-used';

const db = require('../src/models');
const {
    postSalesInvoice,
    postCashReceiptForInvoice,
    reverseInvoiceCashBatches
} = require('../src/services/accountingEngine');

async function repairInv09() {
    console.log('=== INV-09: invoices missing their INVOICE journal batch ===');
    const [rows] = await db.sequelize.query(`
        SELECT o.id, o."orderNumber"
        FROM orders o
        WHERE o."isDeleted" = false
          AND o."customerId" IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM journal_batches jb
              WHERE jb."referenceType" = 'INVOICE'
                AND jb."referenceId" = o.id
                AND jb."isReversed" = false
          )
        ORDER BY o."createdAt" ASC
    `);
    console.log(`Found ${rows.length} invoice(s) without an INVOICE batch.`);

    let fixed = 0, failed = 0;
    for (const { id } of rows) {
        try {
            await db.sequelize.transaction(async (transaction) => {
                const order = await db.order.findByPk(id, { transaction });
                const invoiceResult = await postSalesInvoice(order.toJSON(), transaction);
                // Post the cash batch too when POS cash exists and it was never posted
                // (postCashReceiptForInvoice is idempotent via its dup check).
                let cashResult = { skipped: true };
                if (Number(order.originalPaidAmount) > 0 && Number(order.paidAmount) > 0) {
                    cashResult = await postCashReceiptForInvoice(order.toJSON(), transaction);
                }
                console.log(`  ✓ ${order.orderNumber}: INVOICE=${invoiceResult.batchNumber || invoiceResult.reason || 'posted'}, CASH=${cashResult.batchNumber || cashResult.reason || 'posted'}`);
            });
            fixed++;
        } catch (err) {
            failed++;
            console.error(`  ✗ order ${id}: ${err.message}`);
        }
    }
    console.log(`INV-09 done — repaired ${fixed}, failed ${failed}.\n`);
}

async function repairInv11() {
    console.log('=== INV-11: INVOICE_CASH batches on invoices with paidAmount = 0 ===');
    const [rows] = await db.sequelize.query(`
        SELECT DISTINCT jb."referenceId" AS "orderId", o."orderNumber", o."paidAmount"
        FROM journal_batches jb
        LEFT JOIN orders o ON o.id = jb."referenceId"
        WHERE jb."referenceType" = 'INVOICE_CASH'
          AND jb."isReversed" = false
          AND (o.id IS NULL OR CAST(o."paidAmount" AS NUMERIC) <= 0)
    `);
    console.log(`Found ${rows.length} order(s) with a standing cash batch but no paid amount.`);

    let fixed = 0, failed = 0;
    for (const row of rows) {
        try {
            await db.sequelize.transaction(async (transaction) => {
                const results = await reverseInvoiceCashBatches(
                    { id: row.orderId, orderNumber: row.orderNumber || row.orderId },
                    'Historical repair: paidAmount is 0 but cash batch was never reversed (INV-11)',
                    transaction
                );
                console.log(`  ✓ ${row.orderNumber || row.orderId}: reversed ${results.length} batch(es)`);
            });
            fixed++;
        } catch (err) {
            failed++;
            console.error(`  ✗ ${row.orderNumber || row.orderId}: ${err.message}`);
        }
    }
    console.log(`INV-11 done — repaired ${fixed}, failed ${failed}.\n`);
}

async function main() {
    await db.sequelize.authenticate();
    console.log('DB connected.\n');

    await repairInv09();
    await repairInv11();

    console.log('Repair complete. Restart the backend (or wait for the hourly self-audit) to confirm PASS.');
    process.exit(0);
}

main().catch(err => {
    console.error('Repair script failed:', err);
    process.exit(1);
});
