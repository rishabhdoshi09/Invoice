'use strict';

/**
 * Add columns to orderItems that were previously created by sequelize.sync()
 * but were absent from the original 20240907135157-orderItems.js migration:
 *   - altName   (TEXT, nullable)  – alternate display name for a line item
 *   - sortOrder (INTEGER, NOT NULL DEFAULT 0) – display ordering
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tableDesc = await queryInterface.describeTable('orderItems');

        if (!tableDesc.altName) {
            await queryInterface.addColumn('orderItems', 'altName', {
                type: Sequelize.TEXT,
                allowNull: true
            });
        }

        if (!tableDesc.sortOrder) {
            await queryInterface.addColumn('orderItems', 'sortOrder', {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            });
        }
    },

    async down(queryInterface) {
        const tableDesc = await queryInterface.describeTable('orderItems');
        if (tableDesc.sortOrder) await queryInterface.removeColumn('orderItems', 'sortOrder');
        if (tableDesc.altName)   await queryInterface.removeColumn('orderItems', 'altName');
    }
};
