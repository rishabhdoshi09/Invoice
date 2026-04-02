'use strict';

/**
 * Add soft-delete columns to payments table.
 * The consolidated migration documented this but never implemented it,
 * causing GET /api/dashboard/summary/realtime to 500 with
 * "column isDeleted does not exist".
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const columnExists = async (table, column) => {
            const [results] = await queryInterface.sequelize.query(
                `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}')`
            );
            return results[0].exists;
        };

        if (!(await columnExists('payments', 'isDeleted'))) {
            await queryInterface.addColumn('payments', 'isDeleted', {
                type: Sequelize.BOOLEAN,
                defaultValue: false,
                allowNull: false
            });
            // Backfill existing rows
            await queryInterface.sequelize.query(
                `UPDATE payments SET "isDeleted" = false WHERE "isDeleted" IS NULL`
            );
        }

        if (!(await columnExists('payments', 'deletedAt'))) {
            await queryInterface.addColumn('payments', 'deletedAt', {
                type: Sequelize.DATE,
                allowNull: true
            });
        }

        if (!(await columnExists('payments', 'deletedBy'))) {
            await queryInterface.addColumn('payments', 'deletedBy', {
                type: Sequelize.UUID,
                allowNull: true
            });
        }

        if (!(await columnExists('payments', 'deletedByName'))) {
            await queryInterface.addColumn('payments', 'deletedByName', {
                type: Sequelize.STRING,
                allowNull: true
            });
        }

        // Index for common query pattern: isDeleted = false
        try {
            await queryInterface.addIndex('payments', ['isDeleted'], {
                name: 'idx_payments_isDeleted'
            });
        } catch (e) {
            // Index may already exist
        }
    },

    down: async (queryInterface) => {
        const cols = ['isDeleted', 'deletedAt', 'deletedBy', 'deletedByName'];
        for (const col of cols) {
            try { await queryInterface.removeColumn('payments', col); } catch (e) { /* ignore */ }
        }
        try { await queryInterface.removeIndex('payments', 'idx_payments_isDeleted'); } catch (e) { /* ignore */ }
    }
};
