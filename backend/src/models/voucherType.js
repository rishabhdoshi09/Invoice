module.exports = (sequelize, Sequelize) => {
    return sequelize.define('voucher_types', {
        id:           { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
        name:         { type: Sequelize.STRING(50), allowNull: false, unique: true },
        type:         { type: Sequelize.ENUM('SALES','PURCHASE','RECEIPT','PAYMENT','JOURNAL','CONTRA','DEBIT_NOTE','CREDIT_NOTE'), allowNull: false },
        prefix:       { type: Sequelize.STRING(20), defaultValue: '' },
        lastNumber:   { type: Sequelize.INTEGER, defaultValue: 0 },
        isActive:     { type: Sequelize.BOOLEAN, defaultValue: true },
        affectsStock: { type: Sequelize.BOOLEAN, defaultValue: false }
    });
};
