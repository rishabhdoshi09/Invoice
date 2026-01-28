module.exports = (sequelize, Sequelize) => {
    const stock = sequelize.define(
        'stocks',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            productId: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'products',
                    key: 'id'
                }
            },
            currentStock: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            minStockLevel: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            unit: {
                type: Sequelize.STRING,
                defaultValue: 'kg'
            },
            lastUpdated: {
                type: Sequelize.DATE,
                defaultValue: Sequelize.NOW
            }
        }
    );

    return stock;
};
