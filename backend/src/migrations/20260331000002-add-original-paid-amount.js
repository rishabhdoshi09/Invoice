'use strict';

/**
 * Migration: Add originalPaidAmount to orders
 *
 * PHASE 1 architectural fix for C1/C2/C8.
 *
 * Problem:
 *   paidAmount was used both as the "POS cash at creation" anchor AND as the
 *   running total accumulated by receipt allocations.  Any code that reset
 *   paidAmount from allocation totals alone silently erased the POS cash.
 *
 * Solution:
 *   Introduce originalPaidAmount — immutable, set once at creation, never
 *   touched again.  paidAmount is then always DERIVED:
 *     paidAmount = originalPaidAmount + SUM(active receipt_allocations for this order)
 *
 * Backfill strategy (non-destructive — existing data preserved):
 *   We use the INVOICE_CASH journal batch as the authoritative source for the
 *   original POS cash because it was written atomically with the order and
 *   records exactly what was collected at the counter.
 *
 *   For orders without an INVOICE_CASH batch (credit/unpaid orders):
 *     originalPaidAmount = 0
 *
 *   For orders where the INVOICE_CASH batch exists:
 *     originalPaidAmount = SUM(debit) on that batch's ledger entries
 *
 *   No existing rows are deleted or overwritten.
 */

module.exports = {
    async up(queryInterface, Sequelize) {
        // ── Step 1: Add column (nullable first so existing rows can be backfilled) ──
        await queryInterface.sequelize.query(`
            ALTER TABLE orders
                ADD COLUMN IF NOT EXISTS "originalPaidAmount" DECIMAL(15,2) DEFAULT 0
        `);

        // ── Step 2: Backfill from INVOICE_CASH journal batches ─────────────────────
        // For each order that has an INVOICE_CASH batch, set originalPaidAmount to
        // the debit total of that batch (= cash actually collected at POS).
        await queryInterface.sequelize.query(`
            UPDATE orders o
            SET "originalPaidAmount" = COALESCE((
                SELECT COALESCE(SUM(le.debit), 0)
                FROM journal_batches jb
                INNER JOIN ledger_entries le ON le."batchId" = jb.id
                WHERE jb."referenceType" = 'INVOICE_CASH'
                  AND jb."referenceId" = o.id
                  AND jb."isReversed" = false
            ), 0)
            WHERE "originalPaidAmount" IS NULL OR "originalPaidAmount" = 0
        `);

        // ── Step 3: For orders with no INVOICE_CASH batch but have paidAmount > 0
        //            AND no receipt_allocations: the current paidAmount IS the POS cash.
        //            This handles orders created before the double-entry ledger existed.
        await queryInterface.sequelize.query(`
            UPDATE orders o
            SET "originalPaidAmount" = CAST(o."paidAmount" AS DECIMAL(15,2))
            WHERE o."originalPaidAmount" = 0
              AND o."paidAmount" > 0
              AND NOT EXISTS (
                  SELECT 1 FROM journal_batches jb
                  WHERE jb."referenceType" = 'INVOICE_CASH'
                    AND jb."referenceId" = o.id
              )
              AND NOT EXISTS (
                  SELECT 1 FROM receipt_allocations ra
                  WHERE ra."orderId" = o.id
                    AND ra."isDeleted" = false
              )
        `);

        // ── Step 4: For orders with allocations but no INVOICE_CASH batch:
        //            originalPaidAmount = paidAmount - SUM(active allocations).
        //            This recovers the POS cash component from the stored paidAmount
        //            assuming allocations were added additively (the correct behavior).
        await queryInterface.sequelize.query(`
            UPDATE orders o
            SET "originalPaidAmount" = GREATEST(0,
                CAST(o."paidAmount" AS DECIMAL(15,2)) -
                COALESCE((
                    SELECT SUM(ra.amount)
                    FROM receipt_allocations ra
                    WHERE ra."orderId" = o.id AND ra."isDeleted" = false
                ), 0)
            )
            WHERE o."originalPaidAmount" = 0
              AND o."paidAmount" > 0
              AND NOT EXISTS (
                  SELECT 1 FROM journal_batches jb
                  WHERE jb."referenceType" = 'INVOICE_CASH'
                    AND jb."referenceId" = o.id
              )
              AND EXISTS (
                  SELECT 1 FROM receipt_allocations ra
                  WHERE ra."orderId" = o.id AND ra."isDeleted" = false
              )
        `);

        // ── Step 5: Make column NOT NULL now that all rows are backfilled ──────────
        await queryInterface.sequelize.query(`
            ALTER TABLE orders ALTER COLUMN "originalPaidAmount" SET NOT NULL
        `);

        // ── Step 6: Add immutability trigger ─────────────────────────────────────
        // PostgreSQL trigger that prevents any UPDATE from changing originalPaidAmount
        // after the row is first created.  This is the last line of defence.
        await queryInterface.sequelize.query(`
            CREATE OR REPLACE FUNCTION fn_guard_original_paid_amount()
            RETURNS TRIGGER AS $$
            BEGIN
                IF OLD."originalPaidAmount" IS DISTINCT FROM NEW."originalPaidAmount" THEN
                    RAISE EXCEPTION
                        'originalPaidAmount is immutable. Order % cannot change from % to %.',
                        OLD."orderNumber",
                        OLD."originalPaidAmount",
                        NEW."originalPaidAmount";
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await queryInterface.sequelize.query(`
            DROP TRIGGER IF EXISTS trg_guard_original_paid_amount ON orders;
            CREATE TRIGGER trg_guard_original_paid_amount
                BEFORE UPDATE ON orders
                FOR EACH ROW
                EXECUTE FUNCTION fn_guard_original_paid_amount();
        `);

        console.log('[MIGRATION] 20260331000002: originalPaidAmount added and backfilled.');
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.sequelize.query(`DROP TRIGGER IF EXISTS trg_guard_original_paid_amount ON orders`);
        await queryInterface.sequelize.query(`DROP FUNCTION IF EXISTS fn_guard_original_paid_amount()`);
        await queryInterface.sequelize.query(`ALTER TABLE orders DROP COLUMN IF EXISTS "originalPaidAmount"`);
    }
};
