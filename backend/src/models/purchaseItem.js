const Enums = require('../enums');

module.exports = (sequelize, Sequelize) => {
    const purchaseItem = sequelize.define(
        'purchaseItems',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            purchaseBillId: {
                type: Sequelize.UUID,
                allowNull: false
            },
            name: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            quantity: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            price: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            totalPrice: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            type: {
                type: Sequelize.ENUM(Object.values(Enums.product))
            }
        }
    );

    purchaseItem.associate = (models) => {
        models.purchaseItem.belongsTo(models.purchaseBill, { foreignKey: 'purchaseBillId' });
    };

    return purchaseItem;
};
