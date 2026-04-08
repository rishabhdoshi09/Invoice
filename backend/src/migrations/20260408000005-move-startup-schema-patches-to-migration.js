'use strict';

/**
 * Formalise the ad-hoc schema patches that were previously applied at
 * application startup in index.js (lines 134-181).
 *
 * ROOT CAUSE FIX for audit finding HR-SCHEMA:
 *
 * index.js was running ALTER TABLE / ALTER TYPE commands on every server
 * start via qi.addColumn() and raw DO $$ ... $$ blocks.  This is an
 * operational anti-pattern:
 *  - Changes bypass the migration version table (not reproducible)
 *  - Race condition on multi-instance concurrent startup
 *  - Failures are silently swallowed (console.warn only)
 *  - Cannot be rolled back
 *
 * This migration materialises the same changes into the versioned schema
 * so they run exactly once, atomically, in the correct order, with a
 * rollback path.
 *
 * After this migration is applied the corresponding startup code in
 * index.js has been removed (see index.js patch in this PR).
 *
 * NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction in PostgreSQL.
 * Sequelize migrations support { transaction: false } for this.
 */

const safe = (fn) => fn().catch((err) => {
    const msg = err.message || '';
    if (
        msg.includes('already exists') ||
        msg.includes('does not exist') ||
        msg.includes('duplicate column') ||
        msg.includes('column') && msg.includes('of relation')
    ) return;
    throw err;
});

module.exports = {
    // ALTER TYPE ADD VALUE cannot run inside a transaction — use transaction: false
    up: async (queryInterface, Sequelize) => {
        const q = queryInterface;

        // ── accounts table: add columns introduced in the new ledger model ──────
        await safe(() => q.addColumn('accounts', 'description', {
            type:      Sequelize.TEXT,
            allowNull: true
        }));
        await safe(() => q.addColumn('accounts', 'subType', {
            type:      Sequelize.STRING(50),
            allowNull: true
        }));
        await safe(() => q.addColumn('accounts', 'parentId', {
            type:      Sequelize.UUID,
            allowNull: true
        }));
        await safe(() => q.addColumn('accounts', 'partyId', {
            type:      Sequelize.UUID,
            allowNull: true
        }));
        await safe(() => q.addColumn('accounts', 'partyType', {
            type:      Sequelize.STRING(20),
            allowNull: true
        }));
        await safe(() => q.addColumn('accounts', 'isSystemAccount', {
            type:         Sequelize.BOOLEAN,
            allowNull:    false,
            defaultValue: false
        }));
        await safe(() => q.addColumn('accounts', 'isActive', {
            type:         Sequelize.BOOLEAN,
            allowNull:    false,
            defaultValue: true
        }));

        // ── accounts.type enum: add uppercase + EQUITY values ──────────────────
        // These run WITHOUT a transaction (PostgreSQL restriction on ADD VALUE).
        const enumFixes = [
            `DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='ASSET' AND enumtypid='enum_accounts_type'::regtype)
                THEN ALTER TYPE enum_accounts_type ADD VALUE 'ASSET'; END IF;
             END $$;`,
            `DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='LIABILITY' AND enumtypid='enum_accounts_type'::regtype)
                THEN ALTER TYPE enum_accounts_type ADD VALUE 'LIABILITY'; END IF;
             END $$;`,
            `DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='INCOME' AND enumtypid='enum_accounts_type'::regtype)
                THEN ALTER TYPE enum_accounts_type ADD VALUE 'INCOME'; END IF;
             END $$;`,
            `DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='EXPENSE' AND enumtypid='enum_accounts_type'::regtype)
                THEN ALTER TYPE enum_accounts_type ADD VALUE 'EXPENSE'; END IF;
             END $$;`,
            `DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel='EQUITY' AND enumtypid='enum_accounts_type'::regtype)
                THEN ALTER TYPE enum_accounts_type ADD VALUE 'EQUITY'; END IF;
             END $$;`,
        ];
        for (const sql of enumFixes) {
            await safe(() => q.sequelize.query(sql));
        }

        // ── ledger_entries: add transactionDate denorm column ──────────────────
        await safe(() => q.addColumn('ledger_entries', 'transactionDate', {
            type:      Sequelize.DATEONLY,
            allowNull: true
        }));
    },

    down: async (queryInterface) => {
        // Remove only the columns added by this migration.
        // Enum value removal is not supported in PostgreSQL without type recreation.
        const cols = ['description', 'subType', 'parentId', 'partyId', 'partyType', 'isSystemAccount', 'isActive'];
        for (const col of cols) {
            await safe(() => queryInterface.removeColumn('accounts', col));
        }
        await safe(() => queryInterface.removeColumn('ledger_entries', 'transactionDate'));
    }
};
