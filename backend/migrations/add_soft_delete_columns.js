/**
 * Migration: Add all new columns that were added to models but not yet in the DB.
 * Run once: node migrations/add_soft_delete_columns.js
 */
const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
    process.env.DATABASE_NAME,
    process.env.DB_USER,
    process.env.PASSWORD,
    {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres',
        logging: false
    }
);

async function migrate() {
    try {
        await sequelize.authenticate();
        console.log('Connected to database.');

        const queries = [
            // Payments: soft delete columns
            `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN DEFAULT false`,
            `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP WITH TIME ZONE`,
            `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "deletedBy" UUID`,
            `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "deletedByName" VARCHAR(255)`,

            // Ledger entries: make batchId and accountId nullable
            `ALTER TABLE "ledger_entries" ALTER COLUMN "batchId" DROP NOT NULL`,
            `ALTER TABLE "ledger_entries" ALTER COLUMN "accountId" DROP NOT NULL`,
        ];

        for (const sql of queries) {
            try {
                await sequelize.query(sql);
                console.log(`OK: ${sql.substring(0, 70)}...`);
            } catch (err) {
                if (err.original && err.original.code === '42701') {
                    console.log(`SKIP (already exists): ${sql.substring(0, 70)}...`);
                } else if (err.original && err.original.code === '42P16') {
                    console.log(`SKIP (already nullable): ${sql.substring(0, 70)}...`);
                } else {
                    console.error(`FAIL: ${sql.substring(0, 70)}... — ${err.message}`);
                }
            }
        }

        console.log('\nMigration complete!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
