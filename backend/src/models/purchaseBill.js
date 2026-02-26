module.exports = (sequelize, Sequelize) => {
    const purchaseBill = sequelize.define(
        'purchaseBills',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            billNumber: {
                type: Sequelize.STRING,
                unique: true,
                allowNull: false
            },
            billDate: {
                type: Sequelize.STRING,
                allowNull: false
            },
            supplierId: {
                type: Sequelize.UUID,
                allowNull: false
            },
            subTotal: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            tax: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            taxPercent: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            total: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            paidAmount: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            dueAmount: {
                type: Sequelize.DOUBLE,
                defaultValue: 0
            },
            paymentStatus: {
                type: Sequelize.ENUM('paid', 'partial', 'unpaid'),
                defaultValue: 'unpaid'
            },
            // Soft delete fields
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

    purchaseBill.associate = (models) => {
        models.purchaseBill.belongsTo(models.supplier, { foreignKey: 'supplierId' });
        models.purchaseBill.hasMany(models.purchaseItem, { foreignKey: 'purchaseBillId' });
    };

    return purchaseBill;
};
