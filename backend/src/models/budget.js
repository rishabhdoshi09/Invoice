module.exports = (sequelize, Sequelize) => {
    return sequelize.define('budgets', {
        id:             { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
        name:           { type: Sequelize.STRING(100), allowNull: false },
        financialYear:  { type: Sequelize.STRING(10), allowNull: false },
        accountId:      { type: Sequelize.UUID, allowNull: false },
        accountName:    { type: Sequelize.STRING(200), allowNull: true },
        period:         { type: Sequelize.ENUM('MONTHLY','QUARTERLY','YEARLY'), defaultValue: 'MONTHLY' },
        month:          { type: Sequelize.INTEGER, allowNull: true },
        quarter:        { type: Sequelize.INTEGER, allowNull: true },
        budgetedAmount: { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        actualAmount:   { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        variance:       { type: Sequelize.DECIMAL(15,2), defaultValue: 0 }
    });
};
