module.exports = (sequelize, Sequelize) => {
    const jv = sequelize.define('journal_vouchers', {
        id:            { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
        voucherNumber: { type: Sequelize.STRING(50), allowNull: false, unique: true },
        voucherDate:   { type: Sequelize.DATEONLY, allowNull: false },
        voucherType:   { type: Sequelize.ENUM('JOURNAL','CONTRA','PAYMENT','RECEIPT'), defaultValue: 'JOURNAL' },
        narration:     { type: Sequelize.TEXT, allowNull: true },
        totalDebit:    { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        totalCredit:   { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        isPosted:      { type: Sequelize.BOOLEAN, defaultValue: true },
        isDeleted:     { type: Sequelize.BOOLEAN, defaultValue: false },
        batchId:       { type: Sequelize.UUID, allowNull: true },
        createdBy:     { type: Sequelize.UUID, allowNull: true },
        createdByName: { type: Sequelize.STRING(100), allowNull: true }
    });
    jv.associate = (models) => {
        jv.hasMany(models.journalVoucherLine, { foreignKey: 'voucherId', as: 'lines' });
    };
    return jv;
};
