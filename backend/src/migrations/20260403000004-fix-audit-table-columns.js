'use strict';

/**
 * Fix audit table column mismatches:
 *
 * 1. bill_audit_logs.invoiceContext
 *    Was created as JSONB in 20260227, but the model and controller
 *    store a plain string (e.g. "Next: INV/2026-27/0065").
 *    Convert to TEXT so string inserts don't throw JSON parse errors.
 *
 * 2. weight_logs missing columns
 *    20260227 created weight_logs with only: id, weight, status, userId,
 *    orderId, createdAt, updatedAt. The model also needs:
 *    userName, consumed, orderNumber.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        // ── 1. bill_audit_logs.invoiceContext: JSONB → TEXT ──────────────────
        const [icType] = await queryInterface.sequelize.query(
            `SELECT data_type FROM information_schema.columns
             WHERE table_name = 'bill_audit_logs' AND column_name = 'invoiceContext'`
        );
        if (icType.length > 0 && icType[0].data_type === 'jsonb') {
            await queryInterface.sequelize.query(
                `ALTER TABLE "bill_audit_logs"
                 ALTER COLUMN "invoiceContext" TYPE TEXT USING "invoiceContext"::text`
            );
        }

        // ── 2. weight_logs missing columns ───────────────────────────────────
        const wCols = await queryInterface.describeTable('weight_logs');

        if (!wCols.userName) {
            await queryInterface.addColumn('weight_logs', 'userName', {
                type: Sequelize.STRING,
                allowNull: true
            });
        }
        if (!wCols.consumed) {
            await queryInterface.addColumn('weight_logs', 'consumed', {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            });
        }
        if (!wCols.orderNumber) {
            await queryInterface.addColumn('weight_logs', 'orderNumber', {
                type: Sequelize.STRING,
                allowNull: true
            });
        }
    },

    async down(queryInterface, Sequelize) {
        // Revert invoiceContext back to JSONB
        await queryInterface.sequelize.query(
            `ALTER TABLE "bill_audit_logs"
             ALTER COLUMN "invoiceContext" TYPE JSONB USING "invoiceContext"::jsonb`
        );

        const wCols = await queryInterface.describeTable('weight_logs');
        if (wCols.orderNumber) await queryInterface.removeColumn('weight_logs', 'orderNumber');
        if (wCols.consumed)     await queryInterface.removeColumn('weight_logs', 'consumed');
        if (wCols.userName)     await queryInterface.removeColumn('weight_logs', 'userName');
    }
};
