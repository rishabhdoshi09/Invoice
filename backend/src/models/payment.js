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
                allowNull: false
            },
            partyName: {
                type: Sequelize.STRING,
                allowNull: false
            },
            partyType: {
                type: Sequelize.ENUM('customer', 'supplier'),
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
            }
        }
    );

    return payment;
};
