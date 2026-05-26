module.exports = (sequelize, Sequelize) => {
    const loanTransaction = sequelize.define(
        'loan_transactions',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            loanId: {
                type: Sequelize.UUID,
                allowNull: false
            },
            amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            transactionDate: {
                type: Sequelize.STRING,
                allowNull: false
            },
            notes: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            recordedBy: {
                type: Sequelize.STRING,
                allowNull: true
            }
        },
        {
            tableName: 'loan_transactions',
            timestamps: true,
            indexes: [{ fields: ['loanId'] }]
        }
    );

    loanTransaction.associate = (models) => {
        loanTransaction.belongsTo(models.loan, { foreignKey: 'loanId', as: 'loan' });
    };

    return loanTransaction;
};
