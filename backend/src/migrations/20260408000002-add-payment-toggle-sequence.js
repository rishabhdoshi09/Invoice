'use strict';

/**
 * Add paymentToggleSequence to orders.
 *
 * ROOT CAUSE FIX for audit finding CR-TOGGLE:
 *
 * The original toggle idempotency key was `referenceType = PAYMENT_TOGGLE_UNPAID_PAID`
 * with `referenceId = order.id`.  Because the referenceType is direction-based and
 * static, the 3rd toggle of the same direction hits the existing batch and is SKIPPED
 * silently — leaving the ledger out of sync with the order table.
 *
 * Fix: Each toggle event increments this counter atomically inside the transaction.
 * The counter value is embedded in the journal batch referenceId so every toggle
 * produces a unique, idempotent posting:
 *   referenceType: 'PAYMENT_TOGGLE'
 *   referenceId:   '<order-uuid>_<sequence>'
 *
 * A retry of the same toggle (same sequence) is still deduplicated correctly.
 * A new toggle (incremented sequence) always creates a fresh batch.
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('orders', 'paymentToggleSequence', {
            type:         Sequelize.INTEGER,
            allowNull:    false,
            defaultValue: 0,
            comment:      'Incremented on each payment status toggle. Used to guarantee unique ledger entries per toggle event.'
        });
    },

    down: async (queryInterface) => {
        await queryInterface.removeColumn('orders', 'paymentToggleSequence');
    }
};
