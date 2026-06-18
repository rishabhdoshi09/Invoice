'use strict';

/**
 * Drop fk_jb_order_reference from journal_batches.
 *
 * journal_batches.referenceId is a polymorphic column — it can point to
 * orders, payments, or purchases depending on referenceType. The FK constraint
 * added in 20260408000006 incorrectly restricted it to orders(id) only,
 * causing every payment journal batch to fail at commit time with a
 * ForeignKeyConstraintError (23503). Drop it here for any database that
 * already has it applied.
 */
module.exports = {
    up: async (queryInterface) => {
        await queryInterface.sequelize.query(
            `ALTER TABLE journal_batches DROP CONSTRAINT IF EXISTS fk_jb_order_reference`
        );
    },

    down: async () => {
        // Intentionally empty — the constraint was wrong and must not be re-added.
    }
};
