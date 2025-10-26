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
            quantity: {
                type: Sequelize.DOUBLE
            },
            productPrice: {
                type: Sequelize.DOUBLE
            },
            totalPrice: {
                type: Sequelize.DOUBLE
            },
            type: {
                type: Sequelize.ENUM(Object.values(Enums.product))
            }
        }
    );

    orderItems.associate = (models) => {
        models.orderItems.belongsTo(models.order);
    };

    return orderItems;
};
