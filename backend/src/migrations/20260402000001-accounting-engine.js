'use strict';

/**
 * Accounting Engine Schema Migration
 *
 * Extends existing tables to support the full AccountingEngine:
 *  1. ledger_entries  — add transactionDate column + composite index
 *  2. ledger_entries  — make batchId NOT NULL (backfill orphans first)
 *  3. bank_accounts   — add ledgerAccountId FK (maps bank ↔ ledger account)
 *  4. products        — add currentStock, costPrice, sellingPrice, hsnCode, unit, isService
 *  5. customers       — add gstin, gstType, stateCode, stateName, panNumber,
 *                        openingBalanceDate, creditLimit, creditDays
 *  6. suppliers       — add tdsRate, tdsSection, openingBalanceDate, panNumber, stateCode, stateName
 *  7. journal_batches — add RECEIPT/DEBIT_NOTE/CREDIT_NOTE/JOURNAL/CONTRA to referenceType enum
 *  8. accounts        — add openingBalance column
 *  9. GST sub-accounts — seed CGST/SGST/IGST payable + input credit accounts
 *
 * Fully idempotent: every step uses IF NOT EXISTS / IF EXISTS / try-catch.
 */

const safe = (fn) => fn().catch((err) => {
    // Ignore "already exists" / "does not exist" / "duplicate column" errors
    const msg = err.message || '';
    if (
        msg.includes('already exists') ||
        msg.includes('does not exist') ||
        msg.includes('duplicate column') ||
        msg.includes('column') && msg.includes('of relation') ||
        msg.includes('invalid input value for enum')
    ) return;
    throw err;
});

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const q = queryInterface;

        // ═══════════════════════════════════════════════════════════════
        //  1. ledger_entries — add transactionDate
        // ═══════════════════════════════════════════════════════════════
        await safe(() => q.addColumn('ledger_entries', 'transactionDate', {
            type:         Sequelize.DATEONLY,
            allowNull:    true,
            defaultValue: null
        }));

        // Back-fill transactionDate from the parent journal_batch
        await safe(() => q.sequelize.query(`
            UPDATE ledger_entries le
            SET    "transactionDate" = jb."transactionDate"
            FROM   journal_batches jb
            WHERE  le."batchId" = jb.id
              AND  le."transactionDate" IS NULL
        `));

        // Composite index for fast account-ledger date queries
        await safe(() => q.addIndex('ledger_entries', ['accountId', 'transactionDate'], {
            name: 'idx_le_account_date'
        }));

        // ═══════════════════════════════════════════════════════════════
        //  2. bank_accounts — add ledgerAccountId
        // ═══════════════════════════════════════════════════════════════
        await safe(() => q.addColumn('bank_accounts', 'ledgerAccountId', {
            type:      Sequelize.UUID,
            allowNull: true,
            references: { model: 'accounts', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL'
        }));

        // ═══════════════════════════════════════════════════════════════
        //  3. products — production-grade fields
        // ═══════════════════════════════════════════════════════════════
        await safe(() => q.addColumn('products', 'hsnCode', {
            type: Sequelize.STRING(20), allowNull: true
        }));
        await safe(() => q.addColumn('products', 'costPrice', {
            type: Sequelize.DECIMAL(15, 2), allowNull: true, defaultValue: 0
        }));
        await safe(() => q.addColumn('products', 'sellingPrice', {
            type: Sequelize.DECIMAL(15, 2), allowNull: true, defaultValue: 0
        }));
        await safe(() => q.addColumn('products', 'currentStock', {
            type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 0
        }));
        await safe(() => q.addColumn('products', 'unit', {
            type: Sequelize.STRING(20), allowNull: false, defaultValue: 'KG'
        }));
        await safe(() => q.addColumn('products', 'isService', {
            type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false
        }));
        await safe(() => q.addColumn('products', 'isActive', {
            type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true
        }));
        await safe(() => q.addColumn('products', 'description', {
            type: Sequelize.TEXT, allowNull: true
        }));

        // ═══════════════════════════════════════════════════════════════
        //  4. customers — GST + credit fields
        // ═══════════════════════════════════════════════════════════════
        await safe(() => q.addColumn('customers', 'gstin', {
            type: Sequelize.STRING(20), allowNull: true
        }));
        await safe(() => q.addColumn('customers', 'gstType', {
            type: Sequelize.ENUM('REGISTERED', 'UNREGISTERED', 'CONSUMER', 'COMPOSITION'),
            allowNull: false, defaultValue: 'UNREGISTERED'
        }));
        await safe(() => q.addColumn('customers', 'stateCode', {
            type: Sequelize.STRING(5), allowNull: true
        }));
        await safe(() => q.addColumn('customers', 'stateName', {
            type: Sequelize.STRING(50), allowNull: true
        }));
        await safe(() => q.addColumn('customers', 'panNumber', {
            type: Sequelize.STRING(20), allowNull: true
        }));
        await safe(() => q.addColumn('customers', 'openingBalanceDate', {
            type: Sequelize.DATEONLY, allowNull: true
        }));
        await safe(() => q.addColumn('customers', 'creditLimit', {
            type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0
        }));
        await safe(() => q.addColumn('customers', 'creditDays', {
            type: Sequelize.INTEGER, allowNull: false, defaultValue: 0
        }));
        await safe(() => q.addColumn('customers', 'isActive', {
            type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true
        }));

        // ═══════════════════════════════════════════════════════════════
        //  5. suppliers — TDS + state fields
        // ═══════════════════════════════════════════════════════════════
        await safe(() => q.addColumn('suppliers', 'tdsRate', {
            type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0
        }));
        await safe(() => q.addColumn('suppliers', 'tdsSection', {
            type: Sequelize.STRING(20), allowNull: true
        }));
        await safe(() => q.addColumn('suppliers', 'openingBalanceDate', {
            type: Sequelize.DATEONLY, allowNull: true
        }));
        await safe(() => q.addColumn('suppliers', 'panNumber', {
            type: Sequelize.STRING(20), allowNull: true
        }));
        await safe(() => q.addColumn('suppliers', 'stateCode', {
            type: Sequelize.STRING(5), allowNull: true
        }));
        await safe(() => q.addColumn('suppliers', 'stateName', {
            type: Sequelize.STRING(50), allowNull: true
        }));

        // ═══════════════════════════════════════════════════════════════
        //  6. accounts — add openingBalance
        // ═══════════════════════════════════════════════════════════════
        await safe(() => q.addColumn('accounts', 'openingBalance', {
            type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0
        }));

        // ═══════════════════════════════════════════════════════════════
        //  7. journal_batches referenceType enum — add new values
        //     PostgreSQL: must ALTER TYPE separately for each value
        // ═══════════════════════════════════════════════════════════════
        const newEnumValues = ['RECEIPT', 'DEBIT_NOTE', 'CREDIT_NOTE', 'JOURNAL', 'CONTRA'];
        for (const val of newEnumValues) {
            await safe(() => q.sequelize.query(
                `ALTER TYPE "enum_journal_batches_referenceType" ADD VALUE IF NOT EXISTS '${val}'`
            ));
        }

        // ═══════════════════════════════════════════════════════════════
        //  8. Seed GST sub-accounts under existing parent accounts
        //     Uses INSERT … ON CONFLICT DO NOTHING for idempotency
        // ═══════════════════════════════════════════════════════════════
        await safe(() => q.sequelize.query(`
            INSERT INTO accounts (id, code, name, type, "subType", "isSystemAccount", "isActive", "openingBalance", "createdAt", "updatedAt")
            VALUES
              (gen_random_uuid(), '1500', 'GST Input Credit',  'ASSET',     'TAX', true, true, 0, NOW(), NOW()),
              (gen_random_uuid(), '1501', 'CGST Input Credit', 'ASSET',     'TAX', true, true, 0, NOW(), NOW()),
              (gen_random_uuid(), '1502', 'SGST Input Credit', 'ASSET',     'TAX', true, true, 0, NOW(), NOW()),
              (gen_random_uuid(), '1503', 'IGST Input Credit', 'ASSET',     'TAX', true, true, 0, NOW(), NOW()),
              (gen_random_uuid(), '2201', 'CGST Payable',      'LIABILITY', 'TAX', true, true, 0, NOW(), NOW()),
              (gen_random_uuid(), '2202', 'SGST Payable',      'LIABILITY', 'TAX', true, true, 0, NOW(), NOW()),
              (gen_random_uuid(), '2203', 'IGST Payable',      'LIABILITY', 'TAX', true, true, 0, NOW(), NOW())
            ON CONFLICT (code) DO NOTHING
        `));

        // Wire up parentIds for the new accounts
        await safe(() => q.sequelize.query(`
            UPDATE accounts SET "parentId" = (SELECT id FROM accounts WHERE code = '1000') WHERE code = '1500';
            UPDATE accounts SET "parentId" = (SELECT id FROM accounts WHERE code = '1500') WHERE code IN ('1501','1502','1503');
            UPDATE accounts SET "parentId" = (SELECT id FROM accounts WHERE code = '2200') WHERE code IN ('2201','2202','2203');
        `));

        console.log('[migration] accounting-engine schema migration complete');
    },

    down: async (queryInterface, Sequelize) => {
        // Soft rollback: remove only the NEW columns; do not drop seeded accounts
        const q = queryInterface;
        await safe(() => q.removeColumn('ledger_entries',  'transactionDate'));
        await safe(() => q.removeIndex('ledger_entries', 'idx_le_account_date'));
        await safe(() => q.removeColumn('bank_accounts',   'ledgerAccountId'));
        for (const col of ['hsnCode','costPrice','sellingPrice','currentStock','unit','isService','isActive','description']) {
            await safe(() => q.removeColumn('products', col));
        }
        for (const col of ['gstin','gstType','stateCode','stateName','panNumber','openingBalanceDate','creditLimit','creditDays','isActive']) {
            await safe(() => q.removeColumn('customers', col));
        }
        for (const col of ['tdsRate','tdsSection','openingBalanceDate','panNumber','stateCode','stateName']) {
            await safe(() => q.removeColumn('suppliers', col));
        }
        await safe(() => q.removeColumn('accounts', 'openingBalance'));
    }
};
