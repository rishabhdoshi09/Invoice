
module.exports = (sequelize, Sequelize) => {
    const order = sequelize.define(
        'orders',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            orderNumber: {
                type: Sequelize.STRING,
                unique: true
            },
            orderDate: {
                type: Sequelize.STRING,
            },
            customerName: {
                type: Sequelize.STRING
            },
            customerMobile: {
                type: Sequelize.STRING
            },
            subTotal: {
                type: Sequelize.DOUBLE
            },
            total: {
                type: Sequelize.DOUBLE
            },
            tax: {
                type: Sequelize.DOUBLE
            },
            taxPercent: {
                type: Sequelize.DOUBLE
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
                defaultValue: 'paid'
            },
            customerId: {
                type: Sequelize.UUID,
                allowNull: true
            },
            // Track who created/modified
            createdBy: {
                type: Sequelize.UUID,
                allowNull: true
            },
            createdByName: {
                type: Sequelize.STRING,
                allowNull: true
            },
            modifiedBy: {
                type: Sequelize.UUID,
                allowNull: true
            },
            modifiedByName: {
                type: Sequelize.STRING,
                allowNull: true
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
            // Staff notes (for billing staff to communicate issues)
            staffNotes: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            staffNotesUpdatedAt: {
                type: Sequelize.DATE,
                allowNull: true
            },
            staffNotesUpdatedBy: {
                type: Sequelize.STRING,
                allowNull: true
            }
        }
    );

    order.associate = (models) => {
        models.order.hasMany(models.orderItems);
    };

    return order;
};
