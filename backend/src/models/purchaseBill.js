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
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0
            },
            tax: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0
            },
            taxPercent: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0
            },
            total: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0
            },
            paidAmount: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0
            },
            dueAmount: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0
            },
            // HIGH-02: Advance system — when paidAmount > total the excess is stored here.
            // Invariant: dueAmount >= 0 AND advanceAmount >= 0 AND at most one > 0.
            //   advanceAmount = MAX(0, paidAmount - total)
            //   dueAmount     = MAX(0, total - paidAmount)
            advanceAmount: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0,
                allowNull: false
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
            },
            // WHITE = formal purchase with GST invoice; GREY = informal/cash purchase without GST.
            // Legacy all-or-nothing flag — kept for display/back-compat; the authoritative
            // split is greyAmount/whiteAmount below (must sum to total).
            billType: {
                type: Sequelize.ENUM('white', 'grey'),
                defaultValue: 'white',
                allowNull: false
            },
            // Grey/White split of `total`, chosen at entry. greyAmount + whiteAmount = total.
            greyAmount: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0,
                allowNull: false
            },
            whiteAmount: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0,
                allowNull: false
            },
            notes: {
                type: Sequelize.TEXT,
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
