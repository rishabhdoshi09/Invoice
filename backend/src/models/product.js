const Enums = require('../enums');

module.exports = (sequelize, Sequelize) => {
    const product = sequelize.define(
        'products',
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
            pricePerKg: {
                type: Sequelize.DOUBLE
            },
            type: {
                type: Sequelize.ENUM(Object.values(Enums.product))
            }
        }
    );

    return product;
};
