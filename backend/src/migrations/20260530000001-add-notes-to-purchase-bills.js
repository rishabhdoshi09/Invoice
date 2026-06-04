'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('purchaseBills', 'notes', {
            type: Sequelize.TEXT,
            allowNull: true,
            defaultValue: null
        });
    },
    down: async (queryInterface) => {
        await queryInterface.removeColumn('purchaseBills', 'notes');
    }
};
