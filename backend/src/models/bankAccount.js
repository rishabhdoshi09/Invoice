module.exports = (sequelize, Sequelize) => {
    return sequelize.define('bank_accounts', {
        id:             { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
        name:           { type: Sequelize.STRING(100), allowNull: false },
        bankName:       { type: Sequelize.STRING(100), allowNull: true },
        accountNumber:  { type: Sequelize.STRING(50),  allowNull: true },
        ifscCode:       { type: Sequelize.STRING(20),  allowNull: true },
        branchName:     { type: Sequelize.STRING(100), allowNull: true },
        accountType:    { type: Sequelize.ENUM('CURRENT','SAVINGS','CASH','UPI'), defaultValue: 'CURRENT' },
        openingBalance: { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        currentBalance: { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        isActive:       { type: Sequelize.BOOLEAN, defaultValue: true },
        isDefault:      { type: Sequelize.BOOLEAN, defaultValue: false },
        notes:          { type: Sequelize.TEXT, allowNull: true }
    });
};
