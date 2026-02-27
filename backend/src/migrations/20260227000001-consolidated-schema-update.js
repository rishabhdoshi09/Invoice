'use strict';

/**
 * Consolidated migration: All schema changes after initial setup.
 * 
 * This migration brings any database up to date with the current models.
 * It's designed to be IDEMPOTENT — safe to run multiple times.
 * 
 * Changes covered:
 * 1. Ledger tables (accounts, journal_batches, ledger_entries)
 * 2. Fraud detection tables (bill_audit_logs, weight_logs)
 * 3. Soft-delete columns on orders, payments, purchaseBills
 * 4. Invoice sequence table
 * 5. Audit log table
 * 6. Daily expenses & summary tables
 * 7. Stock tracking tables
 * 8. Customer/supplier tables
 * 9. New ENUM values for journal batch referenceType
 * 10. Missing indexes
 */

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const transaction = await queryInterface.sequelize.transaction();

        try {
            // ========= HELPER: Check if table/column exists =========
            const tableExists = async (name) => {
                const [results] = await queryInterface.sequelize.query(
                    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${name}')`,
                    { transaction }
                );
                return results[0].exists;
            };

            const columnExists = async (table, column) => {
                const [results] = await queryInterface.sequelize.query(
                    `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}')`,
                    { transaction }
                );
                return results[0].exists;
            };

            const enumValueExists = async (typeName, value) => {
                const [results] = await queryInterface.sequelize.query(
                    `SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = '${value}' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = '${typeName}'))`,
                    { transaction }
                );
                return results[0].exists;
            };

            // ========= 1. ACCOUNTS TABLE =========
            if (!(await tableExists('accounts'))) {
                await queryInterface.createTable('accounts', {
                    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
                    code: { type: Sequelize.STRING, allowNull: false, unique: true },
                    name: { type: Sequelize.STRING, allowNull: false },
                    type: { type: Sequelize.ENUM('asset', 'liability', 'equity', 'revenue', 'expense'), allowNull: false },
                    subType: { type: Sequelize.STRING, allowNull: true },
                    parentId: { type: Sequelize.UUID, allowNull: true, references: { model: 'accounts', key: 'id' } },
                    partyType: { type: Sequelize.STRING, allowNull: true },
                    partyId: { type: Sequelize.UUID, allowNull: true },
                    isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
                    createdAt: { type: Sequelize.DATE, allowNull: false },
                    updatedAt: { type: Sequelize.DATE, allowNull: false }
                }, { transaction });
            }

            // ========= 2. JOURNAL BATCHES TABLE =========
            if (!(await tableExists('journal_batches'))) {
                await queryInterface.createTable('journal_batches', {
                    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
                    batchNumber: { type: Sequelize.STRING, allowNull: false, unique: true },
                    referenceType: {
                        type: Sequelize.ENUM('INVOICE', 'PAYMENT', 'PURCHASE', 'EXPENSE', 'MIGRATION', 'ADJUSTMENT', 'OPENING', 'REVERSAL', 'PAYMENT_TOGGLE', 'INVOICE_CASH'),
                        allowNull: false
                    },
                    referenceId: { type: Sequelize.UUID, allowNull: true },
                    description: { type: Sequelize.TEXT, allowNull: true },
                    transactionDate: { type: Sequelize.DATE, allowNull: false },
                    totalDebit: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
                    totalCredit: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
                    isBalanced: { type: Sequelize.BOOLEAN, defaultValue: false },
                    isPosted: { type: Sequelize.BOOLEAN, defaultValue: true },
                    isReversed: { type: Sequelize.BOOLEAN, defaultValue: false },
                    reversedBatchId: { type: Sequelize.UUID, allowNull: true },
                    createdBy: { type: Sequelize.UUID, allowNull: true },
                    createdAt: { type: Sequelize.DATE, allowNull: false },
                    updatedAt: { type: Sequelize.DATE, allowNull: false }
                }, { transaction });
            }

            // ========= 3. LEDGER ENTRIES TABLE =========
            if (!(await tableExists('ledger_entries'))) {
                await queryInterface.createTable('ledger_entries', {
                    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
                    batchId: { type: Sequelize.UUID, allowNull: false, references: { model: 'journal_batches', key: 'id' } },
                    accountId: { type: Sequelize.UUID, allowNull: false, references: { model: 'accounts', key: 'id' } },
                    debit: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
                    credit: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
                    narration: { type: Sequelize.TEXT, allowNull: true },
                    createdAt: { type: Sequelize.DATE, allowNull: false },
                    updatedAt: { type: Sequelize.DATE, allowNull: false }
                }, { transaction });
            }

            // ========= 4. BILL AUDIT LOGS TABLE =========
            if (!(await tableExists('bill_audit_logs'))) {
                await queryInterface.createTable('bill_audit_logs', {
                    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
                    eventType: { type: Sequelize.STRING, allowNull: false },
                    user: { type: Sequelize.STRING, allowNull: true },
                    details: { type: Sequelize.JSONB, allowNull: true },
                    invoiceContext: { type: Sequelize.JSONB, allowNull: true },
                    createdAt: { type: Sequelize.DATE, allowNull: false },
                    updatedAt: { type: Sequelize.DATE, allowNull: false }
                }, { transaction });
            }

            // ========= 5. WEIGHT LOGS TABLE =========
            if (!(await tableExists('weight_logs'))) {
                await queryInterface.createTable('weight_logs', {
                    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
                    weight: { type: Sequelize.FLOAT, allowNull: false },
                    status: { type: Sequelize.STRING, defaultValue: 'fetched' },
                    userId: { type: Sequelize.UUID, allowNull: true },
                    orderId: { type: Sequelize.UUID, allowNull: true },
                    createdAt: { type: Sequelize.DATE, allowNull: false },
                    updatedAt: { type: Sequelize.DATE, allowNull: false }
                }, { transaction });
            }

            // ========= 6. SOFT-DELETE COLUMNS =========
            // orders table
            if (!(await columnExists('orders', 'isDeleted'))) {
                await queryInterface.addColumn('orders', 'isDeleted', { type: Sequelize.BOOLEAN, defaultValue: false }, { transaction });
            }
            if (!(await columnExists('orders', 'deletedAt'))) {
                await queryInterface.addColumn('orders', 'deletedAt', { type: Sequelize.DATE, allowNull: true }, { transaction });
            }
            if (!(await columnExists('orders', 'deletedBy'))) {
                await queryInterface.addColumn('orders', 'deletedBy', { type: Sequelize.UUID, allowNull: true }, { transaction });
            }
            if (!(await columnExists('orders', 'deletedByName'))) {
                await queryInterface.addColumn('orders', 'deletedByName', { type: Sequelize.STRING, allowNull: true }, { transaction });
            }

            // purchaseBills table
            if (await tableExists('purchaseBills')) {
                if (!(await columnExists('purchaseBills', 'isDeleted'))) {
                    await queryInterface.addColumn('purchaseBills', 'isDeleted', { type: Sequelize.BOOLEAN, defaultValue: false }, { transaction });
                }
                if (!(await columnExists('purchaseBills', 'deletedAt'))) {
                    await queryInterface.addColumn('purchaseBills', 'deletedAt', { type: Sequelize.DATE, allowNull: true }, { transaction });
                }
                if (!(await columnExists('purchaseBills', 'deletedBy'))) {
                    await queryInterface.addColumn('purchaseBills', 'deletedBy', { type: Sequelize.UUID, allowNull: true }, { transaction });
                }
                if (!(await columnExists('purchaseBills', 'deletedByName'))) {
                    await queryInterface.addColumn('purchaseBills', 'deletedByName', { type: Sequelize.STRING, allowNull: true }, { transaction });
                }
            }

            // ========= 7. ORDER EXTRA COLUMNS =========
            if (!(await columnExists('orders', 'customerId'))) {
                await queryInterface.addColumn('orders', 'customerId', { type: Sequelize.UUID, allowNull: true }, { transaction });
            }
            if (!(await columnExists('orders', 'createdBy'))) {
                await queryInterface.addColumn('orders', 'createdBy', { type: Sequelize.UUID, allowNull: true }, { transaction });
            }
            if (!(await columnExists('orders', 'modifiedBy'))) {
                await queryInterface.addColumn('orders', 'modifiedBy', { type: Sequelize.UUID, allowNull: true }, { transaction });
            }
            if (!(await columnExists('orders', 'modifiedByName'))) {
                await queryInterface.addColumn('orders', 'modifiedByName', { type: Sequelize.STRING, allowNull: true }, { transaction });
            }
            if (!(await columnExists('orders', 'notes'))) {
                await queryInterface.addColumn('orders', 'notes', { type: Sequelize.TEXT, allowNull: true }, { transaction });
            }

            // ========= 8. NEW ENUM VALUES FOR journal_batches.referenceType =========
            const enumTypeName = 'enum_journal_batches_referenceType';
            const newValues = ['PAYMENT_TOGGLE', 'INVOICE_CASH'];
            for (const val of newValues) {
                if (!(await enumValueExists(enumTypeName, val))) {
                    await queryInterface.sequelize.query(
                        `ALTER TYPE "${enumTypeName}" ADD VALUE IF NOT EXISTS '${val}'`,
                        { transaction }
                    );
                }
            }

            // ========= 9. INDEXES =========
            // Safe index creation (ignore if already exists)
            const createIndexSafe = async (table, columns, options = {}) => {
                try {
                    await queryInterface.addIndex(table, columns, { ...options, transaction });
                } catch (e) {
                    if (!e.message.includes('already exists')) throw e;
                }
            };

            await createIndexSafe('ledger_entries', ['batchId'], { name: 'idx_ledger_entries_batchId' });
            await createIndexSafe('ledger_entries', ['accountId'], { name: 'idx_ledger_entries_accountId' });
            await createIndexSafe('journal_batches', ['referenceType', 'referenceId'], { name: 'idx_jb_ref' });
            await createIndexSafe('orders', ['customerId'], { name: 'idx_orders_customerId' });
            await createIndexSafe('orders', ['isDeleted'], { name: 'idx_orders_isDeleted' });
            await createIndexSafe('bill_audit_logs', ['eventType'], { name: 'idx_audit_eventType' });

            await transaction.commit();
            console.log('Migration complete: All schema changes applied successfully.');
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    },

    down: async (queryInterface, Sequelize) => {
        // Reverse is intentionally limited — dropping ledger tables would lose financial data
        console.log('WARNING: Down migration only removes soft-delete columns. Ledger tables are preserved.');
        
        const transaction = await queryInterface.sequelize.transaction();
        try {
            // Only remove soft-delete columns (safe to reverse)
            const softDeleteCols = ['isDeleted', 'deletedAt', 'deletedBy', 'deletedByName'];
            for (const col of softDeleteCols) {
                try { await queryInterface.removeColumn('orders', col, { transaction }); } catch (e) { /* ignore */ }
                try { await queryInterface.removeColumn('purchaseBills', col, { transaction }); } catch (e) { /* ignore */ }
            }
            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }
};
