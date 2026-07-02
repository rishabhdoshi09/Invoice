module.exports = (sequelize, Sequelize) => {
    const employeeAdvance = sequelize.define(
        'employee_advances',
        {
            id: { type: Sequelize.UUID, primaryKey: true, unique: true, defaultValue: Sequelize.UUIDV4 },
            employeeId: { type: Sequelize.UUID, allowNull: false },
            month: { type: Sequelize.INTEGER, allowNull: false, comment: '1-12' },
            year: { type: Sequelize.INTEGER, allowNull: false },
            amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
            advanceDate: { type: Sequelize.STRING, allowNull: true, comment: 'DD-MM-YYYY' },
            notes: { type: Sequelize.STRING, allowNull: true },
            recordedBy: { type: Sequelize.STRING, allowNull: true },
            isDeleted: { type: Sequelize.BOOLEAN, defaultValue: false }
        },
        {
            tableName: 'employee_advances',
            timestamps: true,
            indexes: [{ fields: ['employeeId', 'month', 'year'] }]
        }
    );

    employeeAdvance.associate = (models) => {
        employeeAdvance.belongsTo(models.employee, { foreignKey: 'employeeId', as: 'employee' });
    };

    return employeeAdvance;
};
