'use strict';

/**
 * Migration: Financial integrity constraints + idempotency key
 *
 * 1. Orders table:
 *    - paidAmount >= 0
 *    - dueAmount  >= 0
 *    - total      >  0
 *    - subTotal   >  0
 *    NOTE: paidAmount <= total constraint intentionally omitted —
 *          legacy overpayments are valid business data.
 *
 * 2. Payments table:
 *    - amount > 0
 *    - idempotencyKey column (STRING, unique, nullable)
 *
 * All changes are IDEMPOTENT — safe to re-run.
 */

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const transaction = await queryInterface.sequelize.transaction();

        try {
            const constraintExists = async (table, name) => {
                const [rows] = await queryInterface.sequelize.query(
                    `SELECT 1 FROM information_schema.table_constraints
                     WHERE table_name = '${table}' AND constraint_name = '${name}'`,
                    { transaction }
                );
                return rows.length > 0;
            };

            const columnExists = async (table, column) => {
                const [rows] = await queryInterface.sequelize.query(
                    `SELECT 1 FROM information_schema.columns
                     WHERE table_name = '${table}' AND column_name = '${column}'`,
                    { transaction }
                );
                return rows.length > 0;
            };

            // ── orders: CHECK constraints (no paidAmount <= total — legacy overpayments allowed) ──
            const orderChecks = [
                { name: 'chk_orders_paidAmount_gte_0', sql: '"paidAmount" >= 0' },
                { name: 'chk_orders_dueAmount_gte_0',  sql: '"dueAmount"  >= 0' },
                { name: 'chk_orders_total_gt_0',       sql: '"total"      >  0' },
                { name: 'chk_orders_subTotal_gt_0',    sql: '"subTotal"   >  0' },
            ];
            for (const { name, sql } of orderChecks) {
                if (!(await constraintExists('orders', name))) {
                    await queryInterface.sequelize.query(
                        `ALTER TABLE "orders" ADD CONSTRAINT "${name}" CHECK (${sql})`,
                        { transaction }
                    );
                }
            }

            // ── payments ────────────────────────────────────────────────────
            if (!(await constraintExists('payments', 'chk_payments_amount_gt_0'))) {
                await queryInterface.sequelize.query(
                    `ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_amount_gt_0" CHECK ("amount" > 0)`,
                    { transaction }
                );
            }

            // idempotencyKey column on payments (nullable, unique)
            if (!(await columnExists('payments', 'idempotencyKey'))) {
                await queryInterface.addColumn('payments', 'idempotencyKey', {
                    type: Sequelize.STRING,
                    allowNull: true,
                    unique: true
                }, { transaction });
            }

            // idempotencyKey column on orders (nullable, unique) — L7
            if (!(await columnExists('orders', 'idempotencyKey'))) {
                await queryInterface.addColumn('orders', 'idempotencyKey', {
                    type: Sequelize.STRING(128),
                    allowNull: true,
                    unique: true
                }, { transaction });
            }

            await transaction.commit();
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    },

    down: async (queryInterface) => {
        const transaction = await queryInterface.sequelize.transaction();
        try {
            const drops = [
                `ALTER TABLE "orders"   DROP CONSTRAINT IF EXISTS "chk_orders_paidAmount_gte_0"`,
                `ALTER TABLE "orders"   DROP CONSTRAINT IF EXISTS "chk_orders_dueAmount_gte_0"`,
                `ALTER TABLE "orders"   DROP CONSTRAINT IF EXISTS "chk_orders_total_gt_0"`,
                `ALTER TABLE "orders"   DROP CONSTRAINT IF EXISTS "chk_orders_subTotal_gt_0"`,
                `ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "chk_payments_amount_gt_0"`,
            ];
            for (const sql of drops) {
                await queryInterface.sequelize.query(sql, { transaction });
            }
            await queryInterface.removeColumn('payments', 'idempotencyKey', { transaction });
            await queryInterface.removeColumn('orders', 'idempotencyKey', { transaction });
            await transaction.commit();
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    }
};
