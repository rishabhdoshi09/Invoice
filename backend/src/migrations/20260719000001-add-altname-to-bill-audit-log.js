'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const cols = await queryInterface.describeTable('bill_audit_logs').catch(() => null);
        if (cols && !cols.altName) {
            await queryInterface.addColumn('bill_audit_logs', 'altName', {
                type: Sequelize.STRING,
                allowNull: true
            });
        }
    },
    down: async (queryInterface) => {
        await queryInterface.removeColumn('bill_audit_logs', 'altName').catch(() => {});
    }
};
