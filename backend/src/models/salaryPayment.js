module.exports = (sequelize, Sequelize) => {
    const salaryPayment = sequelize.define(
        'salary_payments',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            employeeId: {
                type: Sequelize.UUID,
                allowNull: false
            },
            month: {
                type: Sequelize.INTEGER,
                allowNull: false,
                comment: '1-12'
            },
            year: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            monthlySalary: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                comment: 'Snapshot of the employee monthly salary used for this calculation'
            },
            daysInMonth: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            leaveDays: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0,
                comment: 'Leave days excluding Sundays — Sundays are always paid'
            },
            netSalary: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            advanceDeduction: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
                comment: 'Total advance given to employee this month, deducted from net salary'
            },
            paidAmount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0
            },
            dueAmount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            status: {
                type: Sequelize.ENUM('unpaid', 'partial', 'paid'),
                allowNull: false,
                defaultValue: 'unpaid'
            },
            notes: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            isDeleted: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            }
        },
        {
            tableName: 'salary_payments',
            timestamps: true,
            indexes: [{ fields: ['employeeId'] }, { fields: ['month', 'year'] }]
        }
    );

    salaryPayment.associate = (models) => {
        salaryPayment.belongsTo(models.employee, { foreignKey: 'employeeId', as: 'employee' });
    };

    return salaryPayment;
};
