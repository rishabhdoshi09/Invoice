'use strict';

/**
 * Add tokenVersion to users table.
 *
 * ROOT CAUSE FIX for audit finding HR-JWT:
 *
 * JWT tokens expire after 7 days but there is no server-side revocation mechanism.
 * A stolen token remains valid for 7 days even after the user changes their password.
 *
 * Fix: add an integer tokenVersion to each user row. Include the value in the JWT
 * payload. The authenticate middleware validates that the token's version matches
 * the current DB value on every request. Incrementing tokenVersion (on password
 * change, forced logout, or security event) immediately invalidates ALL existing
 * tokens for that user — even unexpired ones.
 *
 * This is cheaper than a Redis blacklist and does not require additional infra.
 * The cost is one extra integer comparison per DB read (which is already happening).
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('users', 'tokenVersion', {
            type:         Sequelize.INTEGER,
            allowNull:    false,
            defaultValue: 0,
            comment:      'Incremented on password change or forced logout. JWT tokens with a lower version are rejected.'
        });
    },

    down: async (queryInterface) => {
        await queryInterface.removeColumn('users', 'tokenVersion');
    }
};
