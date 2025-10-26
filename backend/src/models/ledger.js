module.exports = (sequelize, Sequelize) => {
    const ledger = sequelize.define(
        'ledgers',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            ledgerName: {
                type: Sequelize.STRING,
                unique: true,
                allowNull: false
            },
            ledgerType: {
                type: Sequelize.ENUM('asset', 'liability', 'income', 'expense'),
                allowNull: false
            },
            openingBalance: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            currentBalance: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            }
        }
    );

    ledger.associate = (models) => {
        models.ledger.hasMany(models.ledgerEntry, { foreignKey: 'ledgerId' });
    };

    return ledger;
};
