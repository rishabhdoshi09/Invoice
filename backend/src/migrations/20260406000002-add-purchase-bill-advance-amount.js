'use strict';

/**
 * Migration: add advanceAmount to purchase_bills
 *
 * HIGH-02 — Supplier Advance System
 * When paidAmount > total on a purchase bill the excess must be stored as
 * advanceAmount (not silently dropped or allowed to make dueAmount negative).
 *
 * Invariants enforced here:
 *   advanceAmount >= 0
 *   dueAmount     >= 0
 *   at most one of the two is > 0 at any time
 *
 * Existing rows are repaired so that:
 *   dueAmount     = GREATEST(0, total - paidAmount)
 *   advanceAmount = GREATEST(0, paidAmount - total)
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        // 1. Add column (idempotent — IF NOT EXISTS)
        await queryInterface.sequelize.query(`
            ALTER TABLE purchase_bills
            ADD COLUMN IF NOT EXISTS "advanceAmount" NUMERIC(15,2) NOT NULL DEFAULT 0;
        `);

        // 2. Add non-negative constraint (idempotent — named constraint)
        await queryInterface.sequelize.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'purchase_bills_advance_amount_non_negative'
                ) THEN
                    ALTER TABLE purchase_bills
                    ADD CONSTRAINT purchase_bills_advance_amount_non_negative
                    CHECK ("advanceAmount" >= 0);
                END IF;
            END;
            $$;
        `);

        // 3. Repair existing rows — recompute dueAmount / advanceAmount from totals
        await queryInterface.sequelize.query(`
            UPDATE purchase_bills
            SET
                "dueAmount"     = GREATEST(0, ROUND(CAST("total" AS NUMERIC) - CAST("paidAmount" AS NUMERIC), 2)),
                "advanceAmount" = GREATEST(0, ROUND(CAST("paidAmount" AS NUMERIC) - CAST("total" AS NUMERIC), 2))
            WHERE
                "isDeleted" = false;
        `);

        console.log('[Migration] purchase_bills.advanceAmount added and rows repaired.');
    },

    async down(queryInterface, Sequelize) {
        // Remove constraint first, then column
        await queryInterface.sequelize.query(`
            ALTER TABLE purchase_bills
            DROP CONSTRAINT IF EXISTS purchase_bills_advance_amount_non_negative;
        `);
        await queryInterface.sequelize.query(`
            ALTER TABLE purchase_bills
            DROP COLUMN IF EXISTS "advanceAmount";
        `);
    }
};
