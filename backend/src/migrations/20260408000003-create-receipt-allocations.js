'use strict';

/**
 * Create receipt_allocations table.
 *
 * ROOT CAUSE FIX for audit finding CR-ALLOC:
 *
 * The self-audit invariants INV-13 and INV-14 check that receipt allocations
 * do not exceed the invoice total or the payment amount respectively.
 * Both checks permanently returned SKIP because the receipt_allocations table
 * did not exist — silently suppressing two of the 14 named financial invariants.
 *
 * This table records the mapping between a customer payment and the specific
 * invoice(s) it is being applied to.  It enables:
 *  - Partial payment tracking per invoice
 *  - INV-13: Σ(allocations per invoice) ≤ invoice.total
 *  - INV-14: Σ(allocations per payment) ≤ payment.amount
 *  - Accurate outstanding balance calculation
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('receipt_allocations', {
            id: {
                type:         Sequelize.UUID,
                primaryKey:   true,
                defaultValue: Sequelize.UUIDV4,
                allowNull:    false
            },
            paymentId: {
                type:       Sequelize.UUID,
                allowNull:  false,
                comment:    'The payment record being allocated',
                references: { model: 'payments', key: 'id' },
                onUpdate:   'CASCADE',
                onDelete:   'RESTRICT'
            },
            orderId: {
                type:       Sequelize.UUID,
                allowNull:  false,
                comment:    'The invoice receiving this allocation',
                references: { model: 'orders', key: 'id' },
                onUpdate:   'CASCADE',
                onDelete:   'RESTRICT'
            },
            amount: {
                type:      Sequelize.DECIMAL(15, 2),
                allowNull: false,
                comment:   'Amount allocated from the payment to this invoice'
            },
            allocatedBy: {
                type:      Sequelize.UUID,
                allowNull: true,
                comment:   'User ID who created this allocation'
            },
            allocatedByName: {
                type:      Sequelize.STRING(100),
                allowNull: true
            },
            notes: {
                type:      Sequelize.TEXT,
                allowNull: true
            },
            isDeleted: {
                type:         Sequelize.BOOLEAN,
                allowNull:    false,
                defaultValue: false
            },
            deletedAt: {
                type:      Sequelize.DATE,
                allowNull: true
            },
            deletedBy: {
                type:      Sequelize.UUID,
                allowNull: true
            },
            createdAt: {
                type:      Sequelize.DATE,
                allowNull: false
            },
            updatedAt: {
                type:      Sequelize.DATE,
                allowNull: false
            }
        });

        // Fast lookup: all allocations for a given payment
        await queryInterface.addIndex('receipt_allocations', ['paymentId', 'isDeleted'], {
            name: 'idx_ra_payment_active'
        });
        // Fast lookup: all allocations applied to a given invoice
        await queryInterface.addIndex('receipt_allocations', ['orderId', 'isDeleted'], {
            name: 'idx_ra_order_active'
        });
        // Prevent duplicate allocation of the same payment to the same invoice
        await queryInterface.addIndex('receipt_allocations', ['paymentId', 'orderId'], {
            name:   'idx_ra_payment_order_unique',
            unique: true,
            where:  { isDeleted: false }
        });
    },

    down: async (queryInterface) => {
        await queryInterface.dropTable('receipt_allocations');
    }
};
