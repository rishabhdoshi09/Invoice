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
