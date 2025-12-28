module.exports = (sequelize, Sequelize) => {
    const dailySummary = sequelize.define(
        'daily_summaries',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            date: {
                type: Sequelize.DATEONLY,
                allowNull: false,
                unique: true
            },
            // Opening balance for the day (cash in drawer at start)
            openingBalance: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            openingBalanceSetAt: {
                type: Sequelize.DATE,
                allowNull: true
            },
            openingBalanceSetBy: {
                type: Sequelize.STRING,
                allowNull: true
            },
            totalSales: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            totalOrders: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },
            totalPurchases: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            totalPaymentsReceived: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            totalPaymentsMade: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            // Running invoice number for the day
            lastInvoiceNumber: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },
            // For verification - stores order IDs created this day
            orderIds: {
                type: Sequelize.JSONB,
                defaultValue: []
            },
            // Closed by admin (locks the day)
            isClosed: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            closedAt: {
                type: Sequelize.DATE,
                allowNull: true
            },
            closedBy: {
                type: Sequelize.UUID,
                allowNull: true
            },
            // Closing balance (calculated: opening + sales - expenses)
            closingBalance: {
                type: Sequelize.DOUBLE,
                allowNull: true
            },
            notes: {
                type: Sequelize.TEXT,
                allowNull: true
            }
        },
        {
            indexes: [
                { fields: ['date'], unique: true }
            ]
        }
    );

    return dailySummary;
};
