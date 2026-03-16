'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // Step 1: Create the ENUM type
        await queryInterface.sequelize.query(
            "DO $$ BEGIN CREATE TYPE \"enum_orders_paymentMode\" AS ENUM ('CASH', 'CREDIT'); EXCEPTION WHEN duplicate_object THEN null; END $$;"
        );

        // Step 2: Add the column
        await queryInterface.addColumn('orders', 'paymentMode', {
            type: Sequelize.ENUM('CASH', 'CREDIT'),
            defaultValue: 'CREDIT',
            allowNull: false
        }).catch(() => {
            console.log('paymentMode column already exists, skipping...');
        });

        // Step 3: Backfill existing orders
        // Orders that were CREATED as paid (paidAmount = total, no modifiedByName) → CASH
        // Everything else → CREDIT (default)
        await queryInterface.sequelize.query(`
            UPDATE orders 
            SET "paymentMode" = 'CASH' 
            WHERE "paymentStatus" = 'paid' 
              AND "paidAmount" >= "total" 
              AND ("modifiedByName" IS NULL OR "modifiedByName" = '')
              AND "isDeleted" = false;
        `);

        console.log('[MIGRATION] paymentMode column added and backfilled');
    },
    down: async (queryInterface) => {
        await queryInterface.removeColumn('orders', 'paymentMode');
        await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_orders_paymentMode";');
    }
};
