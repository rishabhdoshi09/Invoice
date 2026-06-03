/**
 * One-time surgical fix for paymentMode data corruption.
 *
 * Run: node backend/fix-payment-mode.js
 *
 * Two problems to fix:
 *
 * PROBLEM A — Over-counted CASH (credit orders wrongly set to CASH by startup migrations):
 *   These orders have originalPaidAmount=0 (no POS cash at creation) but paymentMode='CASH'.
 *   They got set to CASH because the startup migrations used paidAmount or journal_batches as
 *   the discriminator — both are unreliable (ledgerMigrationService backfills INVOICE_CASH for
 *   all paid orders, and paidAmount includes post-creation receipt allocations).
 *   FIX: revert to CREDIT if originalPaidAmount=0 AND has a customer payment receipt.
 *
 * PROBLEM B — Under-counted CASH (genuine POS sales still stuck as CREDIT due to rounding):
 *   These orders were created before the backend rounding fix (Math.round instead of round2).
 *   Frontend sent paidAmount=Math.round(total) but backend stored total=round2(...), causing
 *   paidAmount < total by ≤₹0.50 → dueAmount=small → paymentMode='CREDIT' (wrong).
 *   FIX: set to CASH where originalPaidAmount>0 AND originalPaidAmount>=total-0.50.
 *
 * Discriminator anchor: originalPaidAmount is IMMUTABLE (set once at creation, never touched
 * by any migration). It is the only reliable ground-truth for POS cash.
 */

'use strict';

require('dotenv').config();
const db = require('./src/models');

async function run() {
    try {
        await db.sequelize.authenticate();
        console.log('DB connected.\n');

        // ── DIAGNOSTIC: show current state ────────────────────────────────────
        const [before] = await db.sequelize.query(`
            SELECT
                "paymentMode",
                COUNT(*)::int                          AS count,
                ROUND(SUM("total")::numeric, 2)        AS total_sum,
                ROUND(SUM("paidAmount")::numeric, 2)   AS paid_sum
            FROM orders
            WHERE "isDeleted" = false
              AND "orderDate" = TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY')
            GROUP BY "paymentMode"
            ORDER BY "paymentMode"
        `);
        console.log('=== TODAY\'S ORDERS — BEFORE FIX ===');
        console.table(before);

        const [beforeAll] = await db.sequelize.query(`
            SELECT
                "paymentMode",
                COUNT(*)::int                          AS count,
                ROUND(SUM("total")::numeric, 2)        AS total_sum
            FROM orders
            WHERE "isDeleted" = false
            GROUP BY "paymentMode"
            ORDER BY "paymentMode"
        `);
        console.log('=== ALL ORDERS — BEFORE FIX ===');
        console.table(beforeAll);

        // ── FIX A: Revert wrongly-CASH credit orders back to CREDIT ──────────
        // Condition: paymentMode=CASH AND originalPaidAmount=0 (no POS cash)
        //            AND has an active customer payment receipt (paid via receipt, not POS)
        const [fixAResult] = await db.sequelize.query(`
            UPDATE orders o
            SET "paymentMode" = 'CREDIT',
                "updatedAt"   = NOW()
            WHERE o."paymentMode" = 'CASH'
              AND o."originalPaidAmount" = 0
              AND o."isDeleted" = false
              AND EXISTS (
                  SELECT 1
                  FROM payments p
                  WHERE p."referenceId"   = o.id
                    AND p."referenceType" = 'order'
                    AND p."isDeleted"     = false
              )
            RETURNING o."orderNumber", o."orderDate", o."total", o."paidAmount", o."originalPaidAmount"
        `);
        console.log(`\nFIX A: Reverted ${fixAResult.length} credit orders (paid-via-receipt) from CASH → CREDIT`);
        if (fixAResult.length > 0) console.table(fixAResult);

        // ── FIX B: Set rounding-affected POS sales from CREDIT → CASH ────────
        // Condition: paymentMode=CREDIT AND originalPaidAmount>0
        //            AND originalPaidAmount >= total - 0.50 (only rounding diff)
        const [fixBResult] = await db.sequelize.query(`
            UPDATE orders o
            SET "paymentMode" = 'CASH',
                "updatedAt"   = NOW()
            WHERE o."paymentMode" = 'CREDIT'
              AND o."originalPaidAmount" > 0
              AND o."originalPaidAmount" >= o."total" - 0.50
              AND o."isDeleted" = false
            RETURNING o."orderNumber", o."orderDate", o."total", o."paidAmount", o."originalPaidAmount"
        `);
        console.log(`\nFIX B: Fixed ${fixBResult.length} rounding-affected POS sales from CREDIT → CASH`);
        if (fixBResult.length > 0) console.table(fixBResult);

        // ── DIAGNOSTIC: show state after fix ──────────────────────────────────
        const [afterToday] = await db.sequelize.query(`
            SELECT
                "paymentMode",
                COUNT(*)::int                          AS count,
                ROUND(SUM("total")::numeric, 2)        AS total_sum,
                ROUND(SUM("paidAmount")::numeric, 2)   AS paid_sum
            FROM orders
            WHERE "isDeleted" = false
              AND "orderDate" = TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY')
            GROUP BY "paymentMode"
            ORDER BY "paymentMode"
        `);
        console.log('\n=== TODAY\'S ORDERS — AFTER FIX ===');
        console.table(afterToday);

        const [afterAll] = await db.sequelize.query(`
            SELECT
                "paymentMode",
                COUNT(*)::int                          AS count,
                ROUND(SUM("total")::numeric, 2)        AS total_sum
            FROM orders
            WHERE "isDeleted" = false
            GROUP BY "paymentMode"
            ORDER BY "paymentMode"
        `);
        console.log('=== ALL ORDERS — AFTER FIX ===');
        console.table(afterAll);

        // ── FIX C: CASH orders stuck as 'partial' due to rounding ────────────
        // These are CASH orders where total is a decimal (e.g. 2168.30) but
        // paidAmount is an integer (2168) — diff ≤ ₹0.50. The customer paid
        // in full at POS; the "partial" label is wrong.
        // Fix: set paidAmount=total, dueAmount=0, paymentStatus='paid'.
        const [fixCResult] = await db.sequelize.query(`
            UPDATE orders
            SET "paymentStatus" = 'paid',
                "dueAmount"     = 0,
                "paidAmount"    = "total",
                "updatedAt"     = NOW()
            WHERE "paymentMode"    = 'CASH'
              AND "paymentStatus"  = 'partial'
              AND "total" - "paidAmount" > 0
              AND "total" - "paidAmount" <= 0.50
              AND "isDeleted" = false
            RETURNING "orderNumber", "orderDate", "total", "paidAmount"
        `);
        console.log(`\nFIX C: Fixed ${fixCResult.length} CASH orders from partial → paid (rounding)`);
        if (fixCResult.length > 0) console.table(fixCResult);

        console.log('\nDone. Restart the server and check the cash drawer.');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

run();
