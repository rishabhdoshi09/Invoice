module.exports = (sequelize, Sequelize) => {
    const employee = sequelize.define(
        'employees',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            name: {
                type: Sequelize.STRING,
                allowNull: false
            },
            mobile: {
                type: Sequelize.STRING,
                allowNull: true
            },
            monthlySalary: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            joinDate: {
                type: Sequelize.STRING,
                allowNull: true
            },
            isActive: {
                type: Sequelize.BOOLEAN,
                defaultValue: true
            },
            notes: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            isDeleted: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            deletedAt: { type: Sequelize.DATE, allowNull: true },
            deletedBy: { type: Sequelize.UUID, allowNull: true },
            deletedByName: { type: Sequelize.STRING, allowNull: true }
        },
        {
            tableName: 'employees',
            timestamps: true,
            indexes: [
                { fields: ['isActive'] },
                { fields: ['name'] }
            ]
        }
    );

    employee.associate = (models) => {
        employee.hasMany(models.employeeLeave, { foreignKey: 'employeeId', as: 'leaves' });
        employee.hasMany(models.salaryPayment, { foreignKey: 'employeeId', as: 'salaryPayments' });
    };

    return employee;
};
