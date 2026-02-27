module.exports = (sequelize, Sequelize) => {
    const billAuditLog = sequelize.define(
        'bill_audit_logs',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                defaultValue: Sequelize.UUIDV4
            },
            // Type of event: ITEM_REMOVED, BILL_CLEARED, BILL_DELETED
            eventType: {
                type: Sequelize.ENUM('ITEM_REMOVED', 'BILL_CLEARED', 'BILL_DELETED'),
                allowNull: false
            },
            // Who did it
            userId: {
                type: Sequelize.UUID,
                allowNull: true
            },
            userName: {
                type: Sequelize.STRING,
                allowNull: true
            },
            // Invoice context
            invoiceContext: {
                type: Sequelize.STRING,
                allowNull: true
            },
            // For BILL_DELETED: the actual order ID
            orderId: {
                type: Sequelize.UUID,
                allowNull: true
            },
            // Deleted item details (product name, qty, price, total)
            productName: {
                type: Sequelize.STRING,
                allowNull: true
            },
            quantity: {
                type: Sequelize.DECIMAL(10, 3),
                allowNull: true
            },
            price: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: true
            },
            totalPrice: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: true
            },
            // Snapshot of all items on the bill at the time of deletion
            billSnapshot: {
                type: Sequelize.JSONB,
                allowNull: true
            },
            // Bill total at the time of event
            billTotal: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: true
            },
            // Customer name on the bill (if any)
            customerName: {
                type: Sequelize.STRING,
                allowNull: true
            },
            // IP/device info (optional)
            deviceInfo: {
                type: Sequelize.STRING,
                allowNull: true
            }
        },
        {
            indexes: [
                { fields: ['eventType'] },
                { fields: ['userId'] },
                { fields: ['createdAt'] }
            ]
        }
    );

    return billAuditLog;
};
