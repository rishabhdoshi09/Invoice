'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tables = await queryInterface.showAllTables();

        if (!tables.includes('employee_advances')) {
            await queryInterface.createTable('employee_advances', {
                id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                employeeId: {
                    type: Sequelize.UUID,
                    allowNull: false,
                    references: { model: 'employees', key: 'id' },
                    onDelete: 'CASCADE'
                },
                month: { type: Sequelize.INTEGER, allowNull: false, comment: '1-12' },
                year: { type: Sequelize.INTEGER, allowNull: false },
                amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
                advanceDate: { type: Sequelize.STRING, allowNull: true, comment: 'DD-MM-YYYY' },
                notes: { type: Sequelize.STRING, allowNull: true },
                recordedBy: { type: Sequelize.STRING, allowNull: true },
                isDeleted: { type: Sequelize.BOOLEAN, defaultValue: false },
                createdAt: { type: Sequelize.DATE, allowNull: false },
                updatedAt: { type: Sequelize.DATE, allowNull: false }
            });
            await queryInterface.addIndex('employee_advances', ['employeeId', 'month', 'year'], {
                name: 'idx_advance_employee_month'
            });
        }

        // Add advanceDeduction column to salary_payments if missing
        const spCols = await queryInterface.describeTable('salary_payments').catch(() => null);
        if (spCols && !spCols.advanceDeduction) {
            await queryInterface.addColumn('salary_payments', 'advanceDeduction', {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0
            });
        }
    },

    down: async (queryInterface) => {
        await queryInterface.dropTable('employee_advances').catch(() => {});
        await queryInterface.removeColumn('salary_payments', 'advanceDeduction').catch(() => {});
    }
};
