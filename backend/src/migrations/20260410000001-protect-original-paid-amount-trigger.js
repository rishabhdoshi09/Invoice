'use strict';

/**
 * Migration: Protect originalPaidAmount with a DB-level trigger
 *
 * The `originalPaidAmount` column is the immutable POS-cash anchor written once
 * at invoice creation. All ledger re-posting logic after an edit depends on it.
 * Previously the model comment claimed it was "protected by a DB trigger" — no
 * such trigger existed. This migration creates it.
 *
 * Invariant enforced:
 *   Once originalPaidAmount is written with a non-zero value, any UPDATE that
 *   tries to change it is rejected with a descriptive error. Zero→zero is
 *   allowed (default row, not yet set). Non-zero→same is a no-op and allowed
 *   (idempotent updates that happen to include the field).
 *
 * Down: drops the trigger and function cleanly.
 */

module.exports = {
    async up(queryInterface) {
        // Create the trigger function
        await queryInterface.sequelize.query(`
            CREATE OR REPLACE FUNCTION protect_original_paid_amount()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            AS $$
            BEGIN
                -- Allow: value hasn't changed (idempotent update)
                IF OLD."originalPaidAmount" IS NOT DISTINCT FROM NEW."originalPaidAmount" THEN
                    RETURN NEW;
                END IF;

                -- Allow: old value was zero/null — field is being set for the first time
                IF OLD."originalPaidAmount" IS NULL OR OLD."originalPaidAmount" = 0 THEN
                    RETURN NEW;
                END IF;

                -- Block: non-zero value is being changed — this is a financial integrity violation
                RAISE EXCEPTION
                    'originalPaidAmount is immutable after initial capture. '
                    'Order %, stored value %, attempted change to %. '
                    'This field represents the POS cash collected at sale time and cannot be altered.',
                    OLD."orderNumber",
                    OLD."originalPaidAmount",
                    NEW."originalPaidAmount";
            END;
            $$;
        `);

        // Attach the trigger to the orders table
        await queryInterface.sequelize.query(`
            DROP TRIGGER IF EXISTS enforce_original_paid_immutable ON orders;

            CREATE TRIGGER enforce_original_paid_immutable
                BEFORE UPDATE ON orders
                FOR EACH ROW
                EXECUTE FUNCTION protect_original_paid_amount();
        `);

        console.log('[MIGRATION] DB trigger protect_original_paid_amount created on orders table.');
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query(`
            DROP TRIGGER IF EXISTS enforce_original_paid_immutable ON orders;
        `);
        await queryInterface.sequelize.query(`
            DROP FUNCTION IF EXISTS protect_original_paid_amount();
        `);
        console.log('[MIGRATION] DB trigger protect_original_paid_amount dropped.');
    }
};
