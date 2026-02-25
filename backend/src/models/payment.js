module.exports = (sequelize, Sequelize) => {
    const payment = sequelize.define(
        'payments',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            paymentNumber: {
                type: Sequelize.STRING,
                unique: true,
                allowNull: false
            },
            paymentDate: {
                type: Sequelize.STRING,
                allowNull: false
            },
            partyId: {
                type: Sequelize.UUID,
                allowNull: true
            },
            partyName: {
                type: Sequelize.STRING,
                allowNull: false
            },
            partyType: {
                type: Sequelize.ENUM('customer', 'supplier', 'expense'),
                allowNull: false
            },
            amount: {
                type: Sequelize.DOUBLE,
                allowNull: false
            },
            referenceType: {
                type: Sequelize.ENUM('order', 'purchase', 'advance'),
                allowNull: false
            },
            referenceId: {
                type: Sequelize.UUID,
                allowNull: true
            },
            referenceNumber: {
                type: Sequelize.STRING,
                allowNull: true
            },
            notes: {
                type: Sequelize.TEXT
            },
            isDeleted: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            deletedAt: {
                type: Sequelize.DATE,
                allowNull: true
            },
            deletedBy: {
                type: Sequelize.UUID,
                allowNull: true
            },
            deletedByName: {
                type: Sequelize.STRING,
                allowNull: true
            }
        }
    );

    return payment;
};
