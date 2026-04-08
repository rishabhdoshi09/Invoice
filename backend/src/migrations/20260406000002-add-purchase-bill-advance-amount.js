'use strict';

/**
 * Adds advanceAmount column to purchaseBills table.
 * Invariant: advanceAmount = MAX(0, paidAmount - total), dueAmount = MAX(0, total - paidAmount)
 * At most one of dueAmount/advanceAmount is > 0 at any time.
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableDesc = await queryInterface.describeTable('purchaseBills');

        // 1. Add advanceAmount column if missing
        if (!tableDesc.advanceAmount) {
            await queryInterface.addColumn('purchaseBills', 'advanceAmount', {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0,
                allowNull: false
            });
        }

        // 2. Repair existing rows: recalculate dueAmount and advanceAmount from total/paidAmount
        await queryInterface.sequelize.query(`
            UPDATE "purchaseBills"
            SET
                "dueAmount"     = GREATEST(0, COALESCE("total", 0) - COALESCE("paidAmount", 0)),
                "advanceAmount" = GREATEST(0, COALESCE("paidAmount", 0) - COALESCE("total", 0))
        `);

        // 3. Add CHECK constraints
        await queryInterface.sequelize.query(`
            ALTER TABLE "purchaseBills"
                ADD CONSTRAINT IF NOT EXISTS "chk_purchaseBills_advanceAmount_gte_zero"
                CHECK ("advanceAmount" >= 0)
        `).catch(() => {
            // constraint may already exist — ignore
        });

        await queryInterface.sequelize.query(`
            ALTER TABLE "purchaseBills"
                ADD CONSTRAINT IF NOT EXISTS "chk_purchaseBills_dueOrAdvance"
                CHECK ("dueAmount" = 0 OR "advanceAmount" = 0)
        `).catch(() => {});
    },

    down: async (queryInterface) => {
        await queryInterface.sequelize.query(`
            ALTER TABLE "purchaseBills"
                DROP CONSTRAINT IF EXISTS "chk_purchaseBills_dueOrAdvance"
        `);
        await queryInterface.sequelize.query(`
            ALTER TABLE "purchaseBills"
                DROP CONSTRAINT IF EXISTS "chk_purchaseBills_advanceAmount_gte_zero"
        `);
        const tableDesc = await queryInterface.describeTable('purchaseBills');
        if (tableDesc.advanceAmount) {
            await queryInterface.removeColumn('purchaseBills', 'advanceAmount');
        }
    }
};
