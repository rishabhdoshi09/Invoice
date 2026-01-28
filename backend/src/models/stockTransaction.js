module.exports = (sequelize, Sequelize) => {
    const stockTransaction = sequelize.define(
        'stock_transactions',
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
            type: {
                type: Sequelize.ENUM('in', 'out', 'adjustment'),
                allowNull: false
            },
            quantity: {
                type: Sequelize.DOUBLE,
                allowNull: false
            },
            previousStock: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            newStock: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            referenceType: {
                type: Sequelize.STRING,  // 'purchase', 'sale', 'manual', 'opening'
                allowNull: true
            },
            referenceId: {
                type: Sequelize.UUID,
                allowNull: true
            },
            notes: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            transactionDate: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            createdBy: {
                type: Sequelize.UUID,
                allowNull: true
            },
            createdByName: {
                type: Sequelize.STRING,
                allowNull: true
            }
        }
    );

    stockTransaction.associate = (models) => {
        stockTransaction.belongsTo(models.product, {
            foreignKey: 'productId',
            as: 'product'
        });
    };

    return stockTransaction;
};
