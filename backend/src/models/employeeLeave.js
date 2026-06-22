module.exports = (sequelize, Sequelize) => {
    const employeeLeave = sequelize.define(
        'employee_leaves',
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
            leaveDate: {
                type: Sequelize.STRING,
                allowNull: false
            },
            reason: {
                type: Sequelize.STRING,
                allowNull: true
            },
            recordedBy: {
                type: Sequelize.STRING,
                allowNull: true
            }
        },
        {
            tableName: 'employee_leaves',
            timestamps: true,
            indexes: [{ fields: ['employeeId'] }]
        }
    );

    employeeLeave.associate = (models) => {
        employeeLeave.belongsTo(models.employee, { foreignKey: 'employeeId', as: 'employee' });
    };

    return employeeLeave;
};
