const uuidv1 = require("uuid/v1");

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable("orders", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        unique: true,
        defaultValue: uuidv1(),
      },
      orderNumber: {
        type: Sequelize.STRING,
        unique: true
      },
      orderDate: {
        type: Sequelize.STRING,
      },
      customerName: {
        type: Sequelize.STRING
      },
      customerMobile: {
        type: Sequelize.STRING
      },
      subTotal: {
        type: Sequelize.DOUBLE
      },
      total: {
        type: Sequelize.DOUBLE
      },
      tax: {
        type: Sequelize.DOUBLE
      },
      taxPercent: {
        type: Sequelize.DOUBLE
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
    return queryInterface.dropTable("orders");
  },
};
