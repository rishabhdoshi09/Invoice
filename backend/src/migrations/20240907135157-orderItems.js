const uuidv1 = require("uuid/v1");
const Enums = require('../enums');

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable("orderItems", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        unique: true,
        defaultValue: uuidv1(),
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
      },
      orderId: {
        type: Sequelize.UUID,
        references: {
          model: 'orders',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      createdAt: {
        type: Sequelize.DATE
      },
      updatedAt: {
        type: Sequelize.DATE
      },
      deletedAt: {
        type: Sequelize.DATE
      }
    });
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable("orderItems");
  },
};
