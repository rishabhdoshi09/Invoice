module.exports = (sequelize, Sequelize) => {
    return sequelize.define('hsn_codes', {
        id:          { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
        code:        { type: Sequelize.STRING(20), allowNull: false, unique: true },
        description: { type: Sequelize.TEXT, allowNull: true },
        gstRate:     { type: Sequelize.DECIMAL(5,2), defaultValue: 0 },
        cgstRate:    { type: Sequelize.DECIMAL(5,2), defaultValue: 0 },
        sgstRate:    { type: Sequelize.DECIMAL(5,2), defaultValue: 0 },
        igstRate:    { type: Sequelize.DECIMAL(5,2), defaultValue: 0 },
        cessRate:    { type: Sequelize.DECIMAL(5,2), defaultValue: 0 },
        type:        { type: Sequelize.ENUM('GOODS','SERVICES'), defaultValue: 'GOODS' },
        isActive:    { type: Sequelize.BOOLEAN, defaultValue: true }
    });
};
