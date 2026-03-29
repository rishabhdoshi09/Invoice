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
            mobile: {
                type: Sequelize.STRING
            },
            email: {
                type: Sequelize.STRING
            },
            address: {
                type: Sequelize.TEXT
            },
            gstin: {
                type: Sequelize.STRING
            },
            openingBalance: {
                type: Sequelize.DECIMAL(15, 2)
            },
            currentBalance: {
                type: Sequelize.DECIMAL(15, 2)
            },
            notes: {
                type: Sequelize.TEXT,
                allowNull: true,
                defaultValue: null
            }
        }
    );

    customer.associate = (models) => {
        models.customer.hasMany(models.order, { foreignKey: 'customerId' });
    };

    return customer;
};
