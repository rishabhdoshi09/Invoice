'use strict';

/** Adds missing `description` column to the accounts table. */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableDesc = await queryInterface.describeTable('accounts');
        if (!tableDesc.description) {
            await queryInterface.addColumn('accounts', 'description', {
                type: Sequelize.TEXT,
                allowNull: true,
                defaultValue: null
            });
        }
    },

    down: async (queryInterface) => {
        const tableDesc = await queryInterface.describeTable('accounts');
        if (tableDesc.description) {
            await queryInterface.removeColumn('accounts', 'description');
        }
    }
};
