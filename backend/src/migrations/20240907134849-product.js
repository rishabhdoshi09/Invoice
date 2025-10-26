const uuidv1 = require("uuid/v1");
const Enums = require('../enums');

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable("products", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        unique: true,
        defaultValue: uuidv1(),
      },
      name: {
        type: Sequelize.TEXT
      },
      pricePerKg: {
        type: Sequelize.DOUBLE
      },
      type: {
        type: Sequelize.ENUM(Object.values(Enums.product)),
        defaultValue: Enums.product.WEIGHTED
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
    return queryInterface.dropTable("products");
  },
};
