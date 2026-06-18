module.exports = (sequelize, Sequelize) => {
    return sequelize.define('credit_notes', {
        id:             { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
        noteNumber:     { type: Sequelize.STRING(50), allowNull: false, unique: true },
        noteDate:       { type: Sequelize.DATEONLY, allowNull: false },
        partyId:        { type: Sequelize.UUID, allowNull: true },
        partyName:      { type: Sequelize.STRING(200), allowNull: true },
        partyType:      { type: Sequelize.ENUM('customer','supplier'), defaultValue: 'customer' },
        againstOrderId: { type: Sequelize.UUID, allowNull: true },
        againstBillId:  { type: Sequelize.UUID, allowNull: true },
        reason:         { type: Sequelize.TEXT, allowNull: true },
        subTotal:       { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        cgst:           { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        sgst:           { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        igst:           { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        total:          { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
        status:         { type: Sequelize.ENUM('DRAFT','CONFIRMED','ADJUSTED'), defaultValue: 'CONFIRMED' },
        isDeleted:      { type: Sequelize.BOOLEAN, defaultValue: false },
        createdBy:      { type: Sequelize.UUID, allowNull: true },
        createdByName:  { type: Sequelize.STRING(100), allowNull: true }
    });
};
