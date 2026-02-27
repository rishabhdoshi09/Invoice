module.exports = (sequelize, Sequelize) => {
    const weightLog = sequelize.define(
        'weight_logs',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                defaultValue: Sequelize.UUIDV4
            },
            weight: {
                type: Sequelize.DECIMAL(10, 3),
                allowNull: false
            },
            userId: {
                type: Sequelize.UUID,
                allowNull: true
            },
            userName: {
                type: Sequelize.STRING,
                allowNull: true
            },
            // Was this weight added to a bill?
            consumed: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            },
            // If consumed, which order used it?
            orderId: {
                type: Sequelize.UUID,
                allowNull: true
            },
            orderNumber: {
                type: Sequelize.STRING,
                allowNull: true
            }
        },
        {
            indexes: [
                { fields: ['createdAt'] },
                { fields: ['consumed'] },
                { fields: ['userId'] }
            ]
        }
    );

    return weightLog;
};
