'use strict';

/**
 * Patch migration: tables and columns that were previously created by
 * sequelize.sync() and were missed by earlier bridge migrations.
 *
 * 1. daily_summaries.notes  — TEXT column present in model but not in
 *    20260228000001 CREATE TABLE statement.
 *
 * 2. ledgers table — never had a migration; always relied on sync().
 *    Columns: id, ledgerName, ledgerType, openingBalance, currentBalance,
 *             createdAt, updatedAt.
 *
 * All operations are idempotent.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        // ── 1. daily_summaries.notes ─────────────────────────────────────────
        const dsCols = await queryInterface.describeTable('daily_summaries');
        if (!dsCols.notes) {
            await queryInterface.addColumn('daily_summaries', 'notes', {
                type: Sequelize.TEXT,
                allowNull: true
            });
        }

        // ── 2. ledgers table ─────────────────────────────────────────────────
        const [tables] = await queryInterface.sequelize.query(
            `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ledgers' AND table_schema = 'public')`
        );
        if (!tables[0].exists) {
            await queryInterface.createTable('ledgers', {
                id: {
                    type: Sequelize.UUID,
                    primaryKey: true,
                    unique: true,
                    defaultValue: Sequelize.UUIDV4
                },
                ledgerName: {
                    type: Sequelize.STRING,
                    unique: true,
                    allowNull: false
                },
                ledgerType: {
                    type: Sequelize.ENUM('asset', 'liability', 'income', 'expense'),
                    allowNull: false
                },
                openingBalance: {
                    type: Sequelize.DECIMAL(15, 2),
                    defaultValue: 0
                },
                currentBalance: {
                    type: Sequelize.DECIMAL(15, 2),
                    defaultValue: 0
                },
                createdAt: {
                    type: Sequelize.DATE,
                    allowNull: false
                },
                updatedAt: {
                    type: Sequelize.DATE,
                    allowNull: false
                }
            });
        }
    },

    async down(queryInterface) {
        // Remove notes column if we added it
        const dsCols = await queryInterface.describeTable('daily_summaries');
        if (dsCols.notes) {
            await queryInterface.removeColumn('daily_summaries', 'notes');
        }
        // Drop ledgers table (only if safe)
        await queryInterface.sequelize.query(
            `DROP TABLE IF EXISTS "ledgers"`
        );
    }
};
