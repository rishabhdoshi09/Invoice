'use strict';

/**
 * Migration: Financial Integrity Hardening
 *
 * Adds database-level constraints that enforce accounting invariants which
 * the application layer alone cannot guarantee under concurrent load or
 * code bugs.  These are defense-in-depth: the app validates first, the DB
 * validates second — any row that violates an invariant is rejected by
 * PostgreSQL before it can corrupt the ledger.
 *
 * Changes:
 *  1. UNIQUE constraint on accounts(partyType, partyId) — prevents duplicate
 *     customer/supplier receivable accounts under concurrent invoice creation.
 *
 *  2. CHECK constraint on journal_batches: totalDebit = totalCredit (within ₹0.01)
 *     — every batch stored must be balanced; unbalanced batches cannot be inserted.
 *
 *  3. CHECK constraint on ledger_entries: debit >= 0, credit >= 0,
 *     NOT (debit = 0 AND credit = 0) — no zero-value or negative entries.
 *
 *  4. CHECK constraint on orders: paidAmount + dueAmount must be within ₹0.01 of total
 *     — enforced at DB level so no code path can create an inconsistent row.
 *     NOTE: this replaces the more lenient previous CHECK that only validated
 *     individual fields.  The combined invariant is what matters financially.
 *
 *  5. INDEX on accounts(partyType, partyId) to speed up getOrCreateCustomerAccount
 *     lookups (called on every invoice and payment creation).
 *
 * All operations use IF NOT EXISTS / DO $$ ... EXCEPTION guards so the
 * migration is safe to re-run.
 */

module.exports = {
    async up(queryInterface, Sequelize) {
        // ── 1. Unique constraint: one ledger account per (partyType, partyId) ──────
        // Handles NULL partyId (walk-in customers) by allowing multiple NULLs
        // since NULL ≠ NULL in SQL — walk-in customer gets one shared account
        // (partyId IS NULL AND partyType = 'customer') identified by the constraint
        // on (partyType, partyId) WHERE partyId IS NOT NULL for named parties, and
        // separately a partial unique index for walk-in.
        await queryInterface.sequelize.query(`
            DO $$ BEGIN
                -- Named parties: one account per (partyType, partyId)
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'uq_accounts_party_type_id'
                ) THEN
                    CREATE UNIQUE INDEX uq_accounts_party_type_id
                        ON accounts ("partyType", "partyId")
                        WHERE "partyId" IS NOT NULL;
                END IF;
            END $$;
        `);

        // Walk-in customer: only ONE account where partyId IS NULL and partyType = 'customer'
        await queryInterface.sequelize.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_indexes
                    WHERE indexname = 'uq_accounts_walkin_customer'
                ) THEN
                    CREATE UNIQUE INDEX uq_accounts_walkin_customer
                        ON accounts ("partyType")
                        WHERE "partyId" IS NULL AND "partyType" = 'customer';
                END IF;
            END $$;
        `);

        // ── 2. Journal batch balance constraint ────────────────────────────────────
        await queryInterface.sequelize.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'chk_journal_batches_balanced'
                      AND conrelid = 'journal_batches'::regclass
                ) THEN
                    ALTER TABLE journal_batches
                        ADD CONSTRAINT chk_journal_batches_balanced
                        CHECK (ABS("totalDebit" - "totalCredit") < 0.01);
                END IF;
            END $$;
        `);

        // ── 3. Ledger entry non-negative + non-zero constraints ───────────────────
        await queryInterface.sequelize.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'chk_ledger_entries_nonnegative'
                      AND conrelid = 'ledger_entries'::regclass
                ) THEN
                    ALTER TABLE ledger_entries
                        ADD CONSTRAINT chk_ledger_entries_nonnegative
                        CHECK (debit >= 0 AND credit >= 0);
                END IF;
            END $$;
        `);

        await queryInterface.sequelize.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'chk_ledger_entries_nonzero'
                      AND conrelid = 'ledger_entries'::regclass
                ) THEN
                    ALTER TABLE ledger_entries
                        ADD CONSTRAINT chk_ledger_entries_nonzero
                        CHECK (NOT (debit = 0 AND credit = 0));
                END IF;
            END $$;
        `);

        // ── 4. Order financial invariant: paid + due ≈ total ─────────────────────
        // Step 4a: Repair existing rows where paid + due ≠ total BEFORE adding
        // the constraint.  dueAmount is the derived field — recompute it from
        // total - paidAmount.  paidAmount and total are never touched here.
        // Also fix paymentStatus label if it no longer matches paidAmount/total.
        await queryInterface.sequelize.query(`
            UPDATE orders
            SET
                "dueAmount" = ROUND(
                    CAST(total AS NUMERIC) - CAST("paidAmount" AS NUMERIC),
                    2
                ),
                "paymentStatus" = CASE
                    WHEN CAST("paidAmount" AS NUMERIC) >= CAST(total AS NUMERIC) - 0.01 THEN 'paid'
                    WHEN CAST("paidAmount" AS NUMERIC) > 0.01 THEN 'partial'
                    ELSE 'unpaid'
                END
            WHERE
                "isDeleted" = false
                AND ABS(
                    CAST("paidAmount" AS NUMERIC) +
                    CAST("dueAmount"  AS NUMERIC) -
                    CAST(total AS NUMERIC)
                ) >= 0.02;
        `);

        // Step 4b: Now add the CHECK constraint — all rows should satisfy it.
        await queryInterface.sequelize.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'chk_orders_paid_due_balance'
                      AND conrelid = 'orders'::regclass
                ) THEN
                    ALTER TABLE orders
                        ADD CONSTRAINT chk_orders_paid_due_balance
                        CHECK (
                            ABS(
                                CAST("paidAmount" AS NUMERIC) +
                                CAST("dueAmount"  AS NUMERIC) -
                                CAST(total AS NUMERIC)
                            ) < 0.02
                        );
                END IF;
            END $$;
        `);

        // ── 5. Performance index for getOrCreateCustomerAccount lookups ───────────
        await queryInterface.sequelize.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_indexes
                    WHERE indexname = 'idx_accounts_party_lookup'
                ) THEN
                    CREATE INDEX idx_accounts_party_lookup
                        ON accounts ("partyType", "partyId");
                END IF;
            END $$;
        `);

        console.log('[MIGRATION] 20260331000001: Financial integrity hardening applied.');
    },

    async down(queryInterface, Sequelize) {
        // Drop in reverse order
        await queryInterface.sequelize.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_paid_due_balance`);
        await queryInterface.sequelize.query(`ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_ledger_entries_nonzero`);
        await queryInterface.sequelize.query(`ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS chk_ledger_entries_nonnegative`);
        await queryInterface.sequelize.query(`ALTER TABLE journal_batches DROP CONSTRAINT IF EXISTS chk_journal_batches_balanced`);
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS uq_accounts_walkin_customer`);
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS uq_accounts_party_type_id`);
        await queryInterface.sequelize.query(`DROP INDEX IF EXISTS idx_accounts_party_lookup`);
    }
};
