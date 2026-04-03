'use strict';

module.exports = {
    up: async (queryInterface) => {
        // Step 1: Create the ENUM type (idempotent via DO block)
        await queryInterface.sequelize.query(
            `DO $$ BEGIN
                CREATE TYPE "enum_orders_paymentMode" AS ENUM ('CASH', 'CREDIT');
             EXCEPTION WHEN duplicate_object THEN null;
             END $$;`
        );

        // Step 2: Add the column using raw SQL with IF NOT EXISTS.
        // Sequelize's addColumn for ENUM types internally tries to CREATE TYPE,
        // which fails when the type already exists and causes the column to never
        // be added even though the error is caught in JS.
        await queryInterface.sequelize.query(
            `ALTER TABLE "orders"
             ADD COLUMN IF NOT EXISTS "paymentMode" "enum_orders_paymentMode"
             NOT NULL DEFAULT 'CREDIT'`
        );

        // Step 3: Backfill — only if all referenced columns exist
        const columnsNeeded = ['paymentStatus', 'paidAmount', 'total', 'modifiedByName', 'isDeleted'];
        const colChecks = await Promise.all(columnsNeeded.map(col =>
            queryInterface.sequelize.query(
                `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = '${col}')`
            ).then(([rows]) => rows[0].exists)
        ));
        if (colChecks.every(Boolean)) {
            await queryInterface.sequelize.query(`
                UPDATE orders
                SET "paymentMode" = 'CASH'
                WHERE "paymentStatus" = 'paid'
                  AND "paidAmount" >= "total"
                  AND ("modifiedByName" IS NULL OR "modifiedByName" = '')
                  AND "isDeleted" = false
            `);
        }

        console.log('[MIGRATION] paymentMode column added and backfilled');
    },

    down: async (queryInterface) => {
        await queryInterface.sequelize.query(
            `ALTER TABLE "orders" DROP COLUMN IF EXISTS "paymentMode"`
        );
        await queryInterface.sequelize.query(
            `DROP TYPE IF EXISTS "enum_orders_paymentMode"`
        );
    }
};
