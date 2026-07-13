'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const cols = await queryInterface.describeTable('purchaseBills').catch(() => null);
        if (!cols) return;

        if (!cols.greyAmount) {
            await queryInterface.addColumn('purchaseBills', 'greyAmount', {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0
            });
        }
        if (!cols.whiteAmount) {
            await queryInterface.addColumn('purchaseBills', 'whiteAmount', {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0
            });
        }

        // Backfill existing bills from the old all-or-nothing billType flag
        await queryInterface.sequelize.query(`
            UPDATE "purchaseBills"
            SET "greyAmount"  = CASE WHEN "billType" = 'grey'  THEN total ELSE 0 END,
                "whiteAmount" = CASE WHEN COALESCE("billType", 'white') = 'white' THEN total ELSE 0 END
            WHERE "greyAmount" = 0 AND "whiteAmount" = 0
        `);
    },

    down: async (queryInterface) => {
        await queryInterface.removeColumn('purchaseBills', 'greyAmount').catch(() => {});
        await queryInterface.removeColumn('purchaseBills', 'whiteAmount').catch(() => {});
    }
};
