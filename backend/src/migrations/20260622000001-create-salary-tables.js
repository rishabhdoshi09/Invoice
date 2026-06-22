'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tables = await queryInterface.showAllTables();

        if (!tables.includes('employees')) {
            await queryInterface.createTable('employees', {
                id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                name: { type: Sequelize.STRING, allowNull: false },
                mobile: { type: Sequelize.STRING, allowNull: true },
                monthlySalary: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
                joinDate: { type: Sequelize.STRING, allowNull: true },
                isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
                notes: { type: Sequelize.TEXT, allowNull: true },
                isDeleted: { type: Sequelize.BOOLEAN, defaultValue: false },
                deletedAt: { type: Sequelize.DATE, allowNull: true },
                deletedBy: { type: Sequelize.UUID, allowNull: true },
                deletedByName: { type: Sequelize.STRING, allowNull: true },
                createdAt: { type: Sequelize.DATE, allowNull: false },
                updatedAt: { type: Sequelize.DATE, allowNull: false }
            });
        }

        if (!tables.includes('employee_leaves')) {
            await queryInterface.createTable('employee_leaves', {
                id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                employeeId: {
                    type: Sequelize.UUID,
                    allowNull: false,
                    references: { model: 'employees', key: 'id' },
                    onDelete: 'CASCADE'
                },
                leaveDate: { type: Sequelize.STRING, allowNull: false },
                reason: { type: Sequelize.STRING, allowNull: true },
                recordedBy: { type: Sequelize.STRING, allowNull: true },
                createdAt: { type: Sequelize.DATE, allowNull: false },
                updatedAt: { type: Sequelize.DATE, allowNull: false }
            });
            await queryInterface.addIndex('employee_leaves', ['employeeId', 'leaveDate'], {
                unique: true,
                name: 'uniq_employee_leave_date'
            });
        }

        if (!tables.includes('salary_payments')) {
            await queryInterface.createTable('salary_payments', {
                id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                employeeId: {
                    type: Sequelize.UUID,
                    allowNull: false,
                    references: { model: 'employees', key: 'id' },
                    onDelete: 'CASCADE'
                },
                month: { type: Sequelize.INTEGER, allowNull: false },
                year: { type: Sequelize.INTEGER, allowNull: false },
                monthlySalary: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
                daysInMonth: { type: Sequelize.INTEGER, allowNull: false },
                leaveDays: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
                netSalary: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
                paidAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
                dueAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
                status: { type: Sequelize.ENUM('unpaid', 'partial', 'paid'), allowNull: false, defaultValue: 'unpaid' },
                notes: { type: Sequelize.TEXT, allowNull: true },
                isDeleted: { type: Sequelize.BOOLEAN, defaultValue: false },
                createdAt: { type: Sequelize.DATE, allowNull: false },
                updatedAt: { type: Sequelize.DATE, allowNull: false }
            });
            await queryInterface.addIndex('salary_payments', ['employeeId', 'month', 'year'], {
                unique: true,
                name: 'uniq_employee_salary_month'
            });
        }

        // payments.partyType / referenceType are Postgres ENUMs — add the new
        // values used by salary payouts so inserts don't fail at the DB level.
        const [partyTypeEnum] = await queryInterface.sequelize.query(
            `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_payments_partyType')`
        );
        if (partyTypeEnum[0].exists) {
            await queryInterface.sequelize.query(
                `ALTER TYPE "enum_payments_partyType" ADD VALUE IF NOT EXISTS 'employee';`
            );
        }

        const [referenceTypeEnum] = await queryInterface.sequelize.query(
            `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_payments_referenceType')`
        );
        if (referenceTypeEnum[0].exists) {
            await queryInterface.sequelize.query(
                `ALTER TYPE "enum_payments_referenceType" ADD VALUE IF NOT EXISTS 'salary';`
            );
        }
    },

    down: async (queryInterface) => {
        await queryInterface.dropTable('salary_payments').catch(() => {});
        await queryInterface.dropTable('employee_leaves').catch(() => {});
        await queryInterface.dropTable('employees').catch(() => {});
        // Removing enum values in PostgreSQL is complex and unnecessary for rollback
    }
};
