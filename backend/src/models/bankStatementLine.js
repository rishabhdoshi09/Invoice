module.exports = (sequelize, Sequelize) => {
    const line = sequelize.define('bank_statement_lines', {
        id:               { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
        bankAccountId:    { type: Sequelize.UUID, allowNull: false },
        txnDate:          { type: Sequelize.DATEONLY, allowNull: false },
        description:      { type: Sequelize.TEXT, allowNull: true },
        debit:            { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        credit:           { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        balance:          { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        referenceNo:      { type: Sequelize.STRING(100), allowNull: true },
        isMatched:        { type: Sequelize.BOOLEAN, defaultValue: false },
        matchedPaymentId: { type: Sequelize.UUID, allowNull: true },
        matchedAt:        { type: Sequelize.DATE, allowNull: true }
    });
    line.associate = (models) => {
        line.belongsTo(models.bankAccount, { foreignKey: 'bankAccountId' });
    };
    return line;
};
