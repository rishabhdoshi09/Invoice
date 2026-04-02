'use strict';

/**
 * ERP Audit Fixes — Priority 0 schema remediation
 *
 * 1. Add `currentBalance` to customers table (was missing from model causing silent
 *    Sequelize update-ignore, breaking balance persistence).
 * 2. Add `GST_EXPORT` to audit_logs action enum (used in gstExport route but absent
 *    from enum definition, causing potential silent log failures).
 * 3. Add `paymentMode` enum + column to orders, replacing the startup-time ALTER SQL
 *    in index.js. Idempotent — safe to run even if column already exists.
 * 4. Add `ORDER_PAYMENT_STATUS` and `CONFIRM_LINK` audit enum values (also moved
 *    from startup SQL).
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const columnExists = async (table, col) => {
            const [rows] = await queryInterface.sequelize.query(
                `SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = $1 AND column_name = $2
                )`,
                { bind: [table, col], type: queryInterface.sequelize.QueryTypes.SELECT }
            );
            return rows.exists;
        };

        const enumValueExists = async (enumName, value) => {
            const [rows] = await queryInterface.sequelize.query(
                `SELECT EXISTS (
                    SELECT 1 FROM pg_enum e
                    JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = $1 AND e.enumlabel = $2
                )`,
                { bind: [enumName, value], type: queryInterface.sequelize.QueryTypes.SELECT }
            );
            return rows.exists;
        };

        // ── 1. customers.currentBalance ───────────────────────────────────────────
        if (!(await columnExists('customers', 'currentBalance'))) {
            await queryInterface.addColumn('customers', 'currentBalance', {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
                comment: 'Running receivable balance. Positive = customer owes us, Negative = advance held.'
            });
            // Seed currentBalance from openingBalance for existing rows
            await queryInterface.sequelize.query(
                `UPDATE customers SET "currentBalance" = "openingBalance" WHERE "currentBalance" = 0 AND "openingBalance" != 0`
            );
            console.log('[MIGRATION] Added customers.currentBalance column');
        }

        // ── 2. audit_logs action enum — GST_EXPORT ───────────────────────────────
        if (!(await enumValueExists('enum_audit_logs_action', 'GST_EXPORT'))) {
            await queryInterface.sequelize.query(
                `ALTER TYPE "enum_audit_logs_action" ADD VALUE IF NOT EXISTS 'GST_EXPORT'`
            );
            console.log('[MIGRATION] Added GST_EXPORT to enum_audit_logs_action');
        }

        // ── 3. audit_logs action enum — ORDER_PAYMENT_STATUS & CONFIRM_LINK ──────
        //    (removed from index.js startup SQL)
        if (!(await enumValueExists('enum_audit_logs_action', 'ORDER_PAYMENT_STATUS'))) {
            await queryInterface.sequelize.query(
                `ALTER TYPE "enum_audit_logs_action" ADD VALUE IF NOT EXISTS 'ORDER_PAYMENT_STATUS'`
            );
        }
        if (!(await enumValueExists('enum_audit_logs_action', 'CONFIRM_LINK'))) {
            await queryInterface.sequelize.query(
                `ALTER TYPE "enum_audit_logs_action" ADD VALUE IF NOT EXISTS 'CONFIRM_LINK'`
            );
        }

        // ── 4. orders.paymentMode column (moved from startup ALTER SQL) ───────────
        try {
            await queryInterface.sequelize.query(
                `DO $$ BEGIN CREATE TYPE "enum_orders_paymentMode" AS ENUM ('CASH', 'CREDIT'); EXCEPTION WHEN duplicate_object THEN null; END $$;`
            );
        } catch (e) { /* type may already exist */ }

        if (!(await columnExists('orders', 'paymentMode'))) {
            await queryInterface.addColumn('orders', 'paymentMode', {
                type: Sequelize.ENUM('CASH', 'CREDIT'),
                allowNull: false,
                defaultValue: 'CREDIT'
            });

            // Backfill: orders with linked customer receipts → CREDIT
            await queryInterface.sequelize.query(`
                UPDATE orders SET "paymentMode" = 'CREDIT'
                WHERE "paymentMode" = 'CASH'
                  AND "isDeleted" = false
                  AND EXISTS (
                    SELECT 1 FROM payments
                    WHERE payments."referenceId"::text = orders.id::text
                      AND payments."referenceType" = 'order'
                      AND payments."partyType" = 'customer'
                      AND (payments."isDeleted" = false OR payments."isDeleted" IS NULL)
                      AND (payments."paymentNumber" IS NULL OR payments."paymentNumber" NOT LIKE 'PAY-TOGGLE-%')
                  )
            `);

            // Backfill: paid-at-POS orders with no receipts → CASH
            await queryInterface.sequelize.query(`
                UPDATE orders SET "paymentMode" = 'CASH'
                WHERE "paymentMode" = 'CREDIT'
                  AND "paymentStatus" = 'paid'
                  AND "paidAmount" >= "total"
                  AND "isDeleted" = false
                  AND NOT EXISTS (
                    SELECT 1 FROM payments
                    WHERE payments."referenceId"::text = orders.id::text
                      AND payments."referenceType" = 'order'
                      AND payments."partyType" = 'customer'
                      AND (payments."isDeleted" = false OR payments."isDeleted" IS NULL)
                      AND (payments."paymentNumber" IS NULL OR payments."paymentNumber" NOT LIKE 'PAY-TOGGLE-%')
                  )
            `);
            console.log('[MIGRATION] Added orders.paymentMode column and backfilled values');
        }

        // Index for balance-query patterns
        try {
            await queryInterface.addIndex('customers', ['currentBalance'], {
                name: 'idx_customers_currentBalance'
            });
        } catch (e) { /* index may already exist */ }
    },

    down: async (queryInterface) => {
        try { await queryInterface.removeIndex('customers', 'idx_customers_currentBalance'); } catch (e) {}
        try { await queryInterface.removeColumn('customers', 'currentBalance'); } catch (e) {}
        // Note: PostgreSQL does not support removing enum values; down migration
        // cannot cleanly revert the GST_EXPORT / ORDER_PAYMENT_STATUS / CONFIRM_LINK
        // enum additions. The column removal covers the functional rollback.
    }
};
