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
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0
            },
            currentBalance: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0
            }
        }
    );

    return ledger;
};
