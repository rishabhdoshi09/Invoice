module.exports = (sequelize, Sequelize) => {
    const dailyExpense = sequelize.define(
        'daily_expenses',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            date: {
                type: Sequelize.DATEONLY,
                allowNull: false
            },
            category: {
                type: Sequelize.STRING,
                allowNull: false
            },
            description: {
                type: Sequelize.STRING,
                allowNull: true
            },
            amount: {
                type: Sequelize.DOUBLE,
                allowNull: false
            },
            paidTo: {
                type: Sequelize.STRING,
                allowNull: true
            },
            paymentMode: {
                type: Sequelize.ENUM('cash', 'upi', 'bank', 'other'),
                defaultValue: 'cash'
            },
            createdBy: {
                type: Sequelize.UUID,
                allowNull: true
            },
            createdByName: {
                type: Sequelize.STRING,
                allowNull: true
            }
        },
        {
            indexes: [
                { fields: ['date'] },
                { fields: ['category'] }
            ]
        }
    );

    return dailyExpense;
};
