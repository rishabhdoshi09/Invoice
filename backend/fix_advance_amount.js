/**
 * One-shot fix: adds advanceAmount column to purchaseBills.
 * Run once: node fix_advance_amount.js
 * Safe to run multiple times (IF NOT EXISTS).
 */
require('dotenv').config();
const { Sequelize } = require('sequelize');

const config = require('./src/config/config.js')[process.env.NODE_ENV || 'development'];
const sequelize = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    port: config.port || 5432,
    dialect: 'postgres',
    logging: false
});

async function run() {
    try {
        await sequelize.authenticate();
        console.log('Connected to database.');

        // 1. Add column if missing
        await sequelize.query(`
            ALTER TABLE "purchaseBills"
            ADD COLUMN IF NOT EXISTS "advanceAmount" DECIMAL(15,2) NOT NULL DEFAULT 0
        `);
        console.log('✅ advanceAmount column added (or already existed).');

        // 2. Repair existing rows
        const [, meta] = await sequelize.query(`
            UPDATE "purchaseBills"
            SET
                "dueAmount"     = GREATEST(0, COALESCE("total", 0) - COALESCE("paidAmount", 0)),
                "advanceAmount" = GREATEST(0, COALESCE("paidAmount", 0) - COALESCE("total", 0))
        `);
        console.log(`✅ Repaired ${meta.rowCount} rows.`);

        console.log('\nDone. Restart the server and purchases will work again.');
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await sequelize.close();
    }
}

run();
