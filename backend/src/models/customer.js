module.exports = (sequelize, Sequelize) => {
    const customer = sequelize.define(
        'customers',
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
            mobile: { type: Sequelize.STRING },
            email:  { type: Sequelize.STRING },
            address: { type: Sequelize.TEXT },

            // GST fields
            gstin: { type: Sequelize.STRING(20), allowNull: true },
            gstType: {
                type: Sequelize.ENUM('REGISTERED', 'UNREGISTERED', 'CONSUMER', 'COMPOSITION'),
                allowNull: false,
                defaultValue: 'UNREGISTERED'
            },
            stateCode:  { type: Sequelize.STRING(5),  allowNull: true },
            stateName:  { type: Sequelize.STRING(50), allowNull: true },
            panNumber:  { type: Sequelize.STRING(20), allowNull: true },

            // Balances
            openingBalance: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
                comment: 'Positive = customer owes us (receivable). Negative = we owe customer (advance).'
            },
            openingBalanceDate: { type: Sequelize.DATEONLY, allowNull: true },
            currentBalance: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
                comment: 'Running receivable balance. Updated on every invoice creation, payment, and reversal.'
            },

            // Credit control
            creditLimit: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0
            },
            creditDays: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },

            notes:    { type: Sequelize.TEXT, allowNull: true, defaultValue: null },
            isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true }
        },
        {
            tableName: 'customers',
            timestamps: true,
            indexes: [
                { fields: ['mobile'] },
                { fields: ['gstin']  },
                { fields: ['isActive'], where: { isActive: true } }
            ]
        }
    );

    customer.associate = (models) => {
        models.customer.hasMany(models.order, { foreignKey: 'customerId' });
    };

    return customer;
};
