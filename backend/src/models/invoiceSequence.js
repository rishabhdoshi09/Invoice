module.exports = (sequelize, Sequelize) => {
    const invoiceSequence = sequelize.define(
        'invoice_sequences',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            prefix: {
                type: Sequelize.STRING,
                defaultValue: 'INV'
            },
            // Current sequence number (global, never resets)
            currentNumber: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            },
            // Last date a sequence was generated
            lastDate: {
                type: Sequelize.DATEONLY,
                allowNull: true
            },
            // Daily sequence (resets each day but tracked)
            dailyNumber: {
                type: Sequelize.INTEGER,
                defaultValue: 0
            }
        }
    );

    return invoiceSequence;
};
