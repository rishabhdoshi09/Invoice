'use strict';

/**
 * Repair INV-12 self-audit violations: payments whose partyId points at a
 * supplier/customer row that no longer exists (deleted before the delete
 * paths learned to unlink payments first).
 *
 * Convention (same as the customer/supplier delete paths): dangling partyId
 * becomes NULL, partyName is preserved so ledgers and history stay readable
 * and name-based fallback matching keeps working.
 */
module.exports = {
    up: async (queryInterface) => {
        const [supplierOrphans] = await queryInterface.sequelize.query(`
            UPDATE payments p
            SET "partyId" = NULL
            WHERE p."partyType" = 'supplier'
              AND p."partyId" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.id = p."partyId")
            RETURNING p.id
        `);
        const [customerOrphans] = await queryInterface.sequelize.query(`
            UPDATE payments p
            SET "partyId" = NULL
            WHERE p."partyType" = 'customer'
              AND p."partyId" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = p."partyId")
            RETURNING p.id
        `);
        console.log(`[MIGRATION] Unlinked orphan payments — supplier: ${supplierOrphans.length}, customer: ${customerOrphans.length}`);
    },

    // Irreversible by design: the original dangling partyIds pointed at rows
    // that no longer exist, so there is nothing meaningful to restore.
    down: async () => {}
};
