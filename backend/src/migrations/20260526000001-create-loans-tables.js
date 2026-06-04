module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tables = await queryInterface.showAllTables();

        if (!tables.includes('loans')) {
            await queryInterface.createTable('loans', {
                id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                loanNumber: { type: Sequelize.STRING, unique: true, allowNull: false },
                type: { type: Sequelize.ENUM('given', 'received'), allowNull: false },
                partyName: { type: Sequelize.STRING, allowNull: false },
                partyMobile: { type: Sequelize.STRING, allowNull: true },
                principalAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
                balanceAmount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
                loanDate: { type: Sequelize.STRING, allowNull: false },
                notes: { type: Sequelize.TEXT, allowNull: true },
                status: { type: Sequelize.ENUM('active', 'settled'), defaultValue: 'active' },
                isDeleted: { type: Sequelize.BOOLEAN, defaultValue: false },
                deletedAt: { type: Sequelize.DATE, allowNull: true },
                deletedBy: { type: Sequelize.UUID, allowNull: true },
                deletedByName: { type: Sequelize.STRING, allowNull: true },
                createdAt: { type: Sequelize.DATE, allowNull: false },
                updatedAt: { type: Sequelize.DATE, allowNull: false }
            });
        }

        if (!tables.includes('loan_transactions')) {
            await queryInterface.createTable('loan_transactions', {
                id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                loanId: {
                    type: Sequelize.UUID,
                    allowNull: false,
                    references: { model: 'loans', key: 'id' },
                    onDelete: 'CASCADE'
                },
                amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
                transactionDate: { type: Sequelize.STRING, allowNull: false },
                notes: { type: Sequelize.TEXT, allowNull: true },
                recordedBy: { type: Sequelize.STRING, allowNull: true },
                createdAt: { type: Sequelize.DATE, allowNull: false },
                updatedAt: { type: Sequelize.DATE, allowNull: false }
            });
        }
    },

    down: async (queryInterface) => {
        await queryInterface.dropTable('loan_transactions').catch(() => {});
        await queryInterface.dropTable('loans').catch(() => {});
    }
};
