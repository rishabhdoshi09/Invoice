module.exports = (sequelize, Sequelize) => {
    const account = sequelize.define(
        'account',
        {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            code: {
                type: Sequelize.STRING(20),
                allowNull: false,
                unique: true
            },
            name: {
                type: Sequelize.STRING(100),
                allowNull: false
            },
            type: {
                type: Sequelize.ENUM('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY'),
                allowNull: false
            },
            subType: {
                type: Sequelize.STRING(50),
                allowNull: true,
                comment: 'e.g., RECEIVABLE, PAYABLE, CASH, BANK, SALES, PURCHASE'
            },
            parentId: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: 'accounts',
                    key: 'id'
                }
            },
            partyId: {
                type: Sequelize.UUID,
                allowNull: true,
                comment: 'Links to customer/supplier ID for party accounts'
            },
            partyType: {
                type: Sequelize.ENUM('customer', 'supplier'),
                allowNull: true
            },
            description: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            isActive: {
                type: Sequelize.BOOLEAN,
                defaultValue: true
            },
            isSystemAccount: {
                type: Sequelize.BOOLEAN,
                defaultValue: false,
                comment: 'True for default accounts that cannot be deleted'
            }
        },
        {
            tableName: 'accounts',
            timestamps: true,
            indexes: [
                { fields: ['type'] },
                { fields: ['partyId'] },
                { fields: ['parentId'] },
                { fields: ['code'] }
            ]
        }
    );

    account.associate = (models) => {
        account.belongsTo(models.account, { as: 'parent', foreignKey: 'parentId' });
        account.hasMany(models.account, { as: 'children', foreignKey: 'parentId' });
        account.hasMany(models.ledgerEntry, { foreignKey: 'accountId' });
    };

    return account;
};
