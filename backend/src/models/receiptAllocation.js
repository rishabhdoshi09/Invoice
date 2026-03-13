/**
 * Receipt Allocation (Tally's "Against Ref" / Bill-wise tracking)
 * 
 * Tracks which payment/receipt is allocated against which invoice.
 * This is the Tally-style bill reference system:
 * - "Against Ref" = payment allocated to specific invoice
 * - "On Account" = payment NOT allocated (advance/unadjusted credit)
 * 
 * Invoice due is DERIVED: invoice_total - sum(allocations for that invoice)
 * Customer outstanding: sum(open_invoice_due) - sum(unadjusted credits)
 */
module.exports = (sequelize, Sequelize) => {
    const receiptAllocation = sequelize.define(
        'receipt_allocation',
        {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true
            },
            paymentId: {
                type: Sequelize.UUID,
                allowNull: false,
                comment: 'The payment/receipt being allocated'
            },
            orderId: {
                type: Sequelize.UUID,
                allowNull: false,
                comment: 'The invoice/order this payment is allocated against'
            },
            amount: {
                type: Sequelize.DECIMAL(15, 2),
                allowNull: false,
                validate: { min: 0.01 },
                comment: 'Amount allocated from this payment to this invoice'
            },
            allocatedBy: {
                type: Sequelize.UUID,
                allowNull: true,
                comment: 'User who made this allocation'
            },
            allocatedByName: {
                type: Sequelize.STRING,
                allowNull: true
            },
            notes: {
                type: Sequelize.STRING(255),
                allowNull: true
            },
            isDeleted: {
                type: Sequelize.BOOLEAN,
                defaultValue: false
            }
        },
        {
            tableName: 'receipt_allocations',
            timestamps: true,
            indexes: [
                { fields: ['paymentId'] },
                { fields: ['orderId'] },
                { fields: ['paymentId', 'orderId'] }
            ]
        }
    );

    return receiptAllocation;
};
