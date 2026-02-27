module.exports = (sequelize, Sequelize) => {
    const journalBatch = sequelize.define(
        'journalBatch',
        {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            batchNumber: {
                type: Sequelize.STRING(50),
                allowNull: false,
                unique: true
            },
            referenceType: {
                type: Sequelize.ENUM('INVOICE', 'PAYMENT', 'PURCHASE', 'EXPENSE', 'MIGRATION', 'ADJUSTMENT', 'OPENING', 'REVERSAL', 'PAYMENT_TOGGLE', 'INVOICE_CASH'),
                allowNull: false
            },
            referenceId: {
                type: Sequelize.UUID,
                allowNull: true,
                comment: 'Links to order/payment/purchase ID'
            },
            description: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            transactionDate: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            totalDebit: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
                comment: 'Stored for quick validation, but balance computed from entries'
            },
            totalCredit: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                defaultValue: 0,
                comment: 'Stored for quick validation, but balance computed from entries'
            },
            isBalanced: {
                type: Sequelize.BOOLEAN,
                defaultValue: false,
                comment: 'True only when totalDebit = totalCredit'
            },
            isPosted: {
                type: Sequelize.BOOLEAN,
                defaultValue: true,
                comment: 'Posted entries affect balances'
            },
            isReversed: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            reversedBatchId: {
                type: Sequelize.UUID,
                allowNull: true,
                comment: 'Points to the reversal batch if reversed'
            },
            createdBy: {
                type: Sequelize.UUID,
                allowNull: true
            }
        },
        {
            tableName: 'journal_batches',
            timestamps: true,
            indexes: [
                { fields: ['referenceType'] },
                { fields: ['referenceId'] },
                { fields: ['transactionDate'] },
                { fields: ['batchNumber'] },
                { fields: ['isPosted'] },
                {
                    unique: true,
                    fields: ['referenceType', 'referenceId'],
                    where: {
                        referenceType: ['INVOICE', 'PAYMENT', 'PURCHASE', 'EXPENSE']
                    },
                    name: 'journal_batches_ref_unique'
                }
            ]
        }
    );

    journalBatch.associate = (models) => {
        journalBatch.hasMany(models.ledgerEntry, { as: 'entries', foreignKey: 'batchId' });
    };

    return journalBatch;
};
