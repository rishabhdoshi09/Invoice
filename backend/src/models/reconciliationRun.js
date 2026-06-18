module.exports = (sequelize, Sequelize) => {
    const reconciliationRun = sequelize.define(
        'reconciliation_runs',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
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
                allowNull: true
            },
            errorMessage: {
                type: Sequelize.TEXT,
                allowNull: true
            }
        },
        {
            indexes: [
                { fields: ['startedAt'] },
                { fields: ['overallStatus'] }
            ]
        }
    );

    return reconciliationRun;
};
