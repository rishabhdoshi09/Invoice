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
                allowNull: false,
                references: {
                    model: 'journal_batches',
                    key: 'id'
                }
            },
            accountId: {
                type: Sequelize.UUID,
                allowNull: false,
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
                type: Sequelize.STRING(500),
                allowNull: true
            },
            transactionDate: {
                type: Sequelize.DATEONLY,
                allowNull: true,
                comment: 'Denormalized from journal_batch.transactionDate for fast date-range queries'
            }
        },
        {
            tableName: 'ledger_entries',
            timestamps: true,
            indexes: [
                { fields: ['batchId'] },
                { fields: ['accountId'] },
                { fields: ['transactionDate'] },
                { name: 'idx_le_account_date', fields: ['accountId', 'transactionDate'] }
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
