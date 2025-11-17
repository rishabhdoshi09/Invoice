'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Check if Cash Account ledger already exists
        const [existing] = await queryInterface.sequelize.query(
            `SELECT id FROM ledgers WHERE "ledgerName" = 'Cash Account' LIMIT 1`
        );

        // Only create if it doesn't exist
        if (!existing || existing.length === 0) {
            await queryInterface.bulkInsert('ledgers', [{
                id: Sequelize.literal('uuid_generate_v4()'),
                ledgerName: 'Cash Account',
                ledgerType: 'asset',
                openingBalance: 0,
                currentBalance: 0,
                createdAt: new Date(),
                updatedAt: new Date()
            }], {});
        }
    },

    down: async (queryInterface, Sequelize) => {
        // Remove Cash Account ledger
        await queryInterface.bulkDelete('ledgers', {
            ledgerName: 'Cash Account'
        }, {});
    }
};
