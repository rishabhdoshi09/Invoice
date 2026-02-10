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
