module.exports = (sequelize, Sequelize) => {
    const supplier = sequelize.define(
        'suppliers',
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

    supplier.associate = (models) => {
        models.supplier.hasMany(models.purchaseBill, { foreignKey: 'supplierId' });
    };

    return supplier;
};
