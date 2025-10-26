module.exports = (sequelize, Sequelize) => {
    const ledgerEntry = sequelize.define(
        'ledgerEntries',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            ledgerId: {
                type: Sequelize.UUID,
                allowNull: false
            },
            entryDate: {
                type: Sequelize.STRING,
                allowNull: false
            },
            debit: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            credit: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            balance: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            description: {
                type: Sequelize.TEXT
            },
            referenceType: {
                type: Sequelize.STRING
            },
            referenceId: {
                type: Sequelize.UUID
            }
        }
    );

    ledgerEntry.associate = (models) => {
        models.ledgerEntry.belongsTo(models.ledger, { foreignKey: 'ledgerId' });
    };

    return ledgerEntry;
};
