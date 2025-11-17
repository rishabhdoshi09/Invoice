'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Add ledgerId column to customers table
        await queryInterface.addColumn('customers', 'ledgerId', {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
                model: 'ledgers',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });

        // Add ledgerId column to suppliers table
        await queryInterface.addColumn('suppliers', 'ledgerId', {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
                model: 'ledgers',
                key: 'id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        });
    },

    down: async (queryInterface, Sequelize) => {
        // Remove ledgerId column from customers table
        await queryInterface.removeColumn('customers', 'ledgerId');
        
        // Remove ledgerId column from suppliers table
        await queryInterface.removeColumn('suppliers', 'ledgerId');
    }
};
