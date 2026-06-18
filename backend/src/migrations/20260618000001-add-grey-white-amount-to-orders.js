'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const table = await queryInterface.describeTable('orders');
        if (!table.greyAmount) {
            await queryInterface.addColumn('orders', 'greyAmount', {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0
            });
        }
        if (!table.whiteAmount) {
            await queryInterface.addColumn('orders', 'whiteAmount', {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0
            });
        }

        // Backfill existing CREDIT orders as fully white (no grey split before this feature existed)
        await queryInterface.sequelize.query(`
            UPDATE "orders" SET "whiteAmount" = "total", "greyAmount" = 0
            WHERE "paymentMode" = 'CREDIT' AND "whiteAmount" = 0 AND "greyAmount" = 0 AND "total" > 0
        `);
    },
    down: async (queryInterface) => {
        await queryInterface.removeColumn('orders', 'greyAmount');
        await queryInterface.removeColumn('orders', 'whiteAmount');
    }
};
