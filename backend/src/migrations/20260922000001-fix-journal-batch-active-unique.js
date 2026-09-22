'use strict';

/**
 * Fix the journal-batch uniqueness so editing an invoice can re-post to the
 * ledger.
 *
 * The old unique index enforced one row per (referenceType, referenceId) for
 * INVOICE/PAYMENT/PURCHASE/EXPENSE/INVOICE_CASH — but did NOT exclude reversed
 * batches. On an order edit the code reverses the old INVOICE batch (row stays,
 * isReversed=true) and posts a fresh one, which collided with the reversed row
 * and threw a unique-constraint error → every ledger-affecting edit 500'd.
 *
 * New index adds "isReversed = false" so only the ACTIVE batch per (type, ref)
 * is unique; any number of reversed historical batches may coexist.
 */
module.exports = {
    up: async (queryInterface) => {
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS journal_batches_ref_unique;`);
        await queryInterface.sequelize.query(`
            CREATE UNIQUE INDEX journal_batches_ref_unique
            ON journal_batches ("referenceType", "referenceId")
            WHERE "referenceType" IN ('INVOICE','PAYMENT','PURCHASE','EXPENSE','INVOICE_CASH')
              AND "isReversed" = false;
        `);
    },

    down: async (queryInterface) => {
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS journal_batches_ref_unique;`);
        await queryInterface.sequelize.query(`
            CREATE UNIQUE INDEX journal_batches_ref_unique
            ON journal_batches ("referenceType", "referenceId")
            WHERE "referenceType" IN ('INVOICE','PAYMENT','PURCHASE','EXPENSE','INVOICE_CASH');
        `);
    }
};
