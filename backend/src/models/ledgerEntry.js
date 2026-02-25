module.exports = (sequelize, Sequelize) => {
    const ledgerEntry = sequelize.define(
        'ledgerEntry',
        {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            batchId: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: 'journal_batches',
                    key: 'id'
                }
            },
            accountId: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {
                    model: 'accounts',
                    key: 'id'
                }
            },
            debit: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
                validate: {
                    min: 0
                }
            },
            credit: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
                validate: {
                    min: 0
                }
            },
            narration: {
                type: Sequelize.STRING(255),
                allowNull: true
            }
        },
        {
            tableName: 'ledger_entries',
            timestamps: true,
            indexes: [
                { fields: ['batchId'] },
                { fields: ['accountId'] },
                { fields: ['createdAt'] }
            ],
            validate: {
                eitherDebitOrCredit() {
                    if ((this.debit > 0 && this.credit > 0) || (this.debit === 0 && this.credit === 0)) {
                        throw new Error('Entry must have either debit OR credit, not both or neither');
                    }
                }
            }
        }
    );

    ledgerEntry.associate = (models) => {
        ledgerEntry.belongsTo(models.journalBatch, { as: 'batch', foreignKey: 'batchId' });
        ledgerEntry.belongsTo(models.account, { as: 'account', foreignKey: 'accountId' });
    };

    return ledgerEntry;
};
