const Enums = require('../enums');

module.exports = (sequelize, Sequelize) => {
    const orderItems = sequelize.define(
        'orderItems',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            name: {
                type: Sequelize.TEXT
            },
            altName: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            quantity: {
                type: Sequelize.DECIMAL(15, 2)
            },
            productPrice: {
                type: Sequelize.DECIMAL(15, 2)
            },
            totalPrice: {
                type: Sequelize.DECIMAL(15, 2)
            },
            type: {
                type: Sequelize.ENUM(Object.values(Enums.product))
            },
            sortOrder: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            }
        }
    );

    orderItems.associate = (models) => {
        models.orderItems.belongsTo(models.order);
    };

    return orderItems;
};
