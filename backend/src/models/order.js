
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
            // GST fields for GSTR-1 compliance
            customerGstin: {
                type: Sequelize.STRING,
                allowNull: true
            },
            placeOfSupply: {
                type: Sequelize.STRING,
                allowNull: true,
                defaultValue: '27-Maharashtra'
            },
            subTotal: {
                type: Sequelize.DECIMAL(15, 2)
            },
            total: {
                type: Sequelize.DECIMAL(15, 2)
            },
            tax: {
                type: Sequelize.DECIMAL(15, 2)
            },
            taxPercent: {
                type: Sequelize.DECIMAL(15, 2)
            },
            // ── IMMUTABLE field: set ONCE at invoice creation, never written again ──
            // This is the cash collected at the POS counter at the moment of sale.
            // It is the ground-truth anchor for all paidAmount calculations.
            // paidAmount (the display field) is ALWAYS derived:
            //   paidAmount = originalPaidAmount + SUM(active receipt_allocations)
            // Nothing in the application should ever write to originalPaidAmount after
            // the row is first inserted.
            originalPaidAmount: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0,
                allowNull: false,
                comment: 'Immutable POS cash captured at invoice creation. Never modified after insert.'
            },
            paidAmount: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0
            },
            dueAmount: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0
            },
            // Overpayment / advance credit for future invoices.
            // Exactly one of dueAmount or advanceAmount will be > 0 at any time.
            //   dueAmount    = MAX(0, total - paidAmount)
            //   advanceAmount = MAX(0, paidAmount - total)
            advanceAmount: {
                type: Sequelize.DECIMAL(15, 2),
                defaultValue: 0,
                allowNull: false
            },
            paymentStatus: {
                type: Sequelize.ENUM('paid', 'partial', 'unpaid'),
                defaultValue: 'paid'
            },
            // Incremented atomically on every payment status toggle.
            // Used to build a unique ledger batch referenceId per toggle event,
            // preventing the idempotency-key collision that caused ledger corruption
            // on the 3rd+ toggle of the same direction.
            paymentToggleSequence: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            // CASH = paid at POS, CREDIT = unpaid/due at creation. NEVER changes after creation.
            paymentMode: {
                type: Sequelize.ENUM('CASH', 'CREDIT'),
                defaultValue: 'CREDIT'
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
            // Idempotency key — prevents duplicate invoice creation on retry (L7)
            idempotencyKey: {
                type: Sequelize.STRING(128),
                allowNull: true,
                unique: true
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
