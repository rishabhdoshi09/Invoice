module.exports = (sequelize, Sequelize) => {
    const loan = sequelize.define(
        'loans',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            loanNumber: {
                type: Sequelize.STRING,
                unique: true,
                allowNull: false
            },
            type: {
                type: Sequelize.ENUM('given', 'received'),
                allowNull: false,
                comment: 'given = money lent out; received = money borrowed'
            },
            partyName: {
                type: Sequelize.STRING,
                allowNull: false
            },
            partyMobile: {
                type: Sequelize.STRING,
                allowNull: true
            },
            principalAmount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            balanceAmount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false
            },
            loanDate: {
                type: Sequelize.STRING,
                allowNull: false
            },
            notes: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            status: {
                type: Sequelize.ENUM('active', 'settled'),
                defaultValue: 'active'
            },
            isDeleted: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            deletedAt: { type: Sequelize.DATE, allowNull: true },
            deletedBy: { type: Sequelize.UUID, allowNull: true },
            deletedByName: { type: Sequelize.STRING, allowNull: true }
        },
        {
            tableName: 'loans',
            timestamps: true,
            indexes: [
                { fields: ['type'] },
                { fields: ['status'] },
                { fields: ['partyName'] }
            ]
        }
    );

    loan.associate = (models) => {
        loan.hasMany(models.loanTransaction, { foreignKey: 'loanId', as: 'transactions' });
    };

    return loan;
};
