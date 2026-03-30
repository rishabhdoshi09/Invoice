module.exports = (sequelize, Sequelize) => {
    const line = sequelize.define('journal_voucher_lines', {
        id:           { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
        voucherId:    { type: Sequelize.UUID, allowNull: false },
        accountId:    { type: Sequelize.UUID, allowNull: false },
        accountName:  { type: Sequelize.STRING(200), allowNull: true },
        debit:        { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        credit:       { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        narration:    { type: Sequelize.TEXT, allowNull: true },
        costCenterId: { type: Sequelize.UUID, allowNull: true }
    });
    line.associate = (models) => {
        line.belongsTo(models.journalVoucher, { foreignKey: 'voucherId' });
        line.belongsTo(models.account, { foreignKey: 'accountId' });
    };
    return line;
};
