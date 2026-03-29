'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('reconciliation_runs', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
                allowNull: false
            },
            triggeredBy: {
                type: Sequelize.STRING(64),
                allowNull: false,
                defaultValue: 'scheduler'
            },
            startedAt: {
                type: Sequelize.DATE,
                allowNull: false
            },
            finishedAt: {
                type: Sequelize.DATE,
                allowNull: true
            },
            durationMs: {
                type: Sequelize.INTEGER,
                allowNull: true
            },
            overallStatus: {
                type: Sequelize.ENUM('OK', 'WARNING', 'CRITICAL', 'HALT', 'ERROR'),
                allowNull: false,
                defaultValue: 'OK'
            },
            passCount: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            failCount: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            skipCount: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            errorCount: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            haltCount: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            criticalCount: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            warningCount: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            results: {
                type: Sequelize.JSONB,
                allowNull: true,
                comment: 'Full array of invariant check results'
            },
            errorMessage: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('NOW()')
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('NOW()')
            }
        });

        await queryInterface.addIndex('reconciliation_runs', ['startedAt'], {
            name: 'idx_reconciliation_runs_started_at'
        });

        await queryInterface.addIndex('reconciliation_runs', ['overallStatus'], {
            name: 'idx_reconciliation_runs_status'
        });
    },

    down: async (queryInterface) => {
        await queryInterface.dropTable('reconciliation_runs');
    }
};
