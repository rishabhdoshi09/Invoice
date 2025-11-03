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
                type: Sequelize.DOUBLE
            },
            currentBalance: {
                type: Sequelize.DOUBLE
            }
        }
    );

    customer.associate = (models) => {
        models.customer.hasMany(models.order, { foreignKey: 'customerId' });
    };

    return customer;
};
