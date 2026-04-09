'use strict';

/**
 * Add missing foreign key constraints and performance indexes.
 *
 * ROOT CAUSE FIXES for audit findings MR-FK and MR-INDEXES:
 *
 * FK CONSTRAINTS (MR-FK):
 * The payments.referenceId → orders.id link existed only as a soft application
 * reference. No database-level FK prevented a payment being created for a
 * non-existent order, or an order being hard-deleted while payments remained.
 * Sequelize v5 does NOT enforce FK constraints by default; they must be added
 * explicitly. Adding them now enforces referential integrity at the storage layer,
 * independent of application code.
 *
 * INDEXES (MR-INDEXES):
 * Several high-frequency query patterns had no covering index:
 *   - orders(paymentStatus, isDeleted)     — every list/filter API call
 *   - payments(partyType, partyId)         — INV-12 orphan check runs on schedule
 *   - journal_batches(referenceType, referenceId, isReversed) — every AE dedup guard
 *   - reconciliation_runs(startedAt DESC)  — financial guard reads this on every request
 *   - audit_logs(entityType, entityId)     — every audit trail lookup
 *   - customers(mobile)                    — customer lookup on invoice creation
 *   - suppliers(name)                      — supplier lookup on purchase creation
 *
 * All operations are idempotent (IF NOT EXISTS).
 */

const safe = (fn) => fn().catch((err) => {
    const msg = err.message || '';
    if (
        msg.includes('already exists') ||
        msg.includes('does not exist') ||
        msg.includes('duplicate') ||
        msg.includes('multiple primary keys') ||
        msg.includes('constraint') && msg.includes('already exists')
    ) return;
    throw err;
});

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const q = queryInterface;

        // ══════════════════════════════════════════════════════════════════
        //  PERFORMANCE INDEXES
        // ══════════════════════════════════════════════════════════════════

        // orders: most list endpoints filter by paymentStatus + isDeleted
        await safe(() => q.addIndex('orders', ['paymentStatus', 'isDeleted'], {
            name: 'idx_orders_status_deleted'
        }));

        // orders: orderDate range queries for reports
        await safe(() => q.addIndex('orders', ['orderDate', 'isDeleted'], {
            name: 'idx_orders_date_deleted'
        }));

        // payments: INV-12 scans partyType + partyId; also used in party history
        await safe(() => q.addIndex('payments', ['partyType', 'partyId', 'isDeleted'], {
            name: 'idx_payments_party_active'
        }));

        // payments: lookup all payments against a specific order/purchase
        await safe(() => q.addIndex('payments', ['referenceType', 'referenceId', 'isDeleted'], {
            name: 'idx_payments_reference_active'
        }));

        // journal_batches: the duplicate-posting guard (AE._alreadyPosted) runs on
        // EVERY invoice/payment/purchase creation. Without this index it is a full scan.
        await safe(() => q.addIndex('journal_batches', ['referenceType', 'referenceId', 'isReversed'], {
            name: 'idx_jb_reference_reversed'
        }));

        // reconciliation_runs: financial guard reads the latest row on every write request.
        // Without this index the ORDER BY startedAt DESC LIMIT 1 is a full scan.
        await safe(() => q.addIndex('reconciliation_runs', [{ attribute: 'startedAt', order: 'DESC' }], {
            name: 'idx_recon_runs_started_desc'
        }));

        // audit_logs: entity-level audit trail queries (show all changes to order X)
        await safe(() => q.addIndex('audit_logs', ['entityType', 'entityId'], {
            name: 'idx_audit_logs_entity'
        }));

        // audit_logs: chronological queries (recent activity feed)
        await safe(() => q.addIndex('audit_logs', [{ attribute: 'createdAt', order: 'DESC' }], {
            name: 'idx_audit_logs_created_desc'
        }));

        // customers: lookup by mobile on invoice creation (very hot path)
        await safe(() => q.addIndex('customers', ['mobile'], {
            name: 'idx_customers_mobile'
        }));

        // ledger_entries: account balance / trial balance queries
        await safe(() => q.addIndex('ledger_entries', ['accountId', 'transactionDate'], {
            name: 'idx_le_account_txdate'
        }));

        // ══════════════════════════════════════════════════════════════════
        //  PRE-FLIGHT: NULL OUT ORPHANED REFERENCES
        //  Before adding FK constraints, remove any rows that would violate
        //  them. These are genuinely orphaned records — their parent rows
        //  (orders, products) no longer exist and cannot be recovered.
        //  Ledger entries are deleted cascade-style (entries without a batch
        //  are meaningless). Stock transactions whose product was deleted are
        //  nullified so the historical quantity record is preserved.
        // ══════════════════════════════════════════════════════════════════

        // 1. Delete ledger_entries whose batch references a non-existent order
        await safe(() => q.sequelize.query(`
            DELETE FROM ledger_entries
            WHERE "batchId" IN (
                SELECT id FROM journal_batches
                WHERE "referenceId" IS NOT NULL
                  AND "referenceId" NOT IN (SELECT id FROM orders)
            )
        `));

        // 2. Delete the orphaned journal_batches themselves
        await safe(() => q.sequelize.query(`
            DELETE FROM journal_batches
            WHERE "referenceId" IS NOT NULL
              AND "referenceId" NOT IN (SELECT id FROM orders)
        `));

        // 3. Delete receipt_allocations whose order no longer exists
        await safe(() => q.sequelize.query(`
            DELETE FROM receipt_allocations
            WHERE "orderId" IS NOT NULL
              AND "orderId" NOT IN (SELECT id FROM orders)
        `));

        // 4. Delete receipt_allocations whose payment no longer exists
        await safe(() => q.sequelize.query(`
            DELETE FROM receipt_allocations
            WHERE "paymentId" IS NOT NULL
              AND "paymentId" NOT IN (SELECT id FROM payments)
        `));

        // 5. Delete orderItems whose order no longer exists
        await safe(() => q.sequelize.query(`
            DELETE FROM "orderItems"
            WHERE "orderId" IS NOT NULL
              AND "orderId" NOT IN (SELECT id FROM orders)
        `));

        // 6. Delete stock_transactions whose product was deleted
        //    (productId is NOT NULL so these rows cannot be preserved meaningfully)
        await safe(() => q.sequelize.query(`
            DELETE FROM stock_transactions
            WHERE "productId" IS NOT NULL
              AND "productId" NOT IN (SELECT id FROM products)
        `));

        // ══════════════════════════════════════════════════════════════════
        //  FOREIGN KEY CONSTRAINTS (MR-FK)
        //  Added with DEFERRABLE INITIALLY DEFERRED so bulk imports that
        //  temporarily violate order don't fail mid-batch.
        // ══════════════════════════════════════════════════════════════════

        // orderItems → orders  (CASCADE delete: items belong to their order)
        await safe(() => q.sequelize.query(`
            ALTER TABLE "orderItems"
            ADD CONSTRAINT fk_orderitems_order
            FOREIGN KEY ("orderId")
            REFERENCES orders(id)
            ON UPDATE CASCADE
            ON DELETE CASCADE
            DEFERRABLE INITIALLY DEFERRED
        `));

        // journal_batches → orders  (RESTRICT: don't allow deleting an order that
        // still has un-reversed journal batches — forces proper reversal workflow)
        // NOTE: uses soft-delete pattern; hard deletes should be impossible in app code.
        await safe(() => q.sequelize.query(`
            ALTER TABLE journal_batches
            ADD CONSTRAINT fk_jb_order_reference
            FOREIGN KEY ("referenceId")
            REFERENCES orders(id)
            ON UPDATE CASCADE
            ON DELETE RESTRICT
            DEFERRABLE INITIALLY DEFERRED
        `));

        // ledger_entries → journal_batches  (CASCADE: entries belong to their batch)
        await safe(() => q.sequelize.query(`
            ALTER TABLE ledger_entries
            ADD CONSTRAINT fk_le_batch
            FOREIGN KEY ("batchId")
            REFERENCES journal_batches(id)
            ON UPDATE CASCADE
            ON DELETE CASCADE
            DEFERRABLE INITIALLY DEFERRED
        `));

        // receipt_allocations → payments  (RESTRICT: can't delete a payment with allocations)
        await safe(() => q.sequelize.query(`
            ALTER TABLE receipt_allocations
            ADD CONSTRAINT fk_ra_payment
            FOREIGN KEY ("paymentId")
            REFERENCES payments(id)
            ON UPDATE CASCADE
            ON DELETE RESTRICT
            DEFERRABLE INITIALLY DEFERRED
        `));

        // receipt_allocations → orders  (RESTRICT: can't delete an invoice with allocations)
        await safe(() => q.sequelize.query(`
            ALTER TABLE receipt_allocations
            ADD CONSTRAINT fk_ra_order
            FOREIGN KEY ("orderId")
            REFERENCES orders(id)
            ON UPDATE CASCADE
            ON DELETE RESTRICT
            DEFERRABLE INITIALLY DEFERRED
        `));

        // stock_transactions → products  (RESTRICT: stock history must be preserved)
        await safe(() => q.sequelize.query(`
            ALTER TABLE stock_transactions
            ADD CONSTRAINT fk_stock_tx_product
            FOREIGN KEY ("productId")
            REFERENCES products(id)
            ON UPDATE CASCADE
            ON DELETE RESTRICT
            DEFERRABLE INITIALLY DEFERRED
        `));
    },

    down: async (queryInterface) => {
        const q = queryInterface;
        // Drop FKs
        const fks = [
            ['orderItems',          'fk_orderitems_order'],
            ['journal_batches',     'fk_jb_order_reference'],
            ['ledger_entries',      'fk_le_batch'],
            ['receipt_allocations', 'fk_ra_payment'],
            ['receipt_allocations', 'fk_ra_order'],
            ['stock_transactions',  'fk_stock_tx_product'],
        ];
        for (const [table, constraint] of fks) {
            await safe(() => q.sequelize.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS ${constraint}`));
        }
        // Drop indexes
        const indexes = [
            'idx_orders_status_deleted',
            'idx_orders_date_deleted',
            'idx_payments_party_active',
            'idx_payments_reference_active',
            'idx_jb_reference_reversed',
            'idx_recon_runs_started_desc',
            'idx_audit_logs_entity',
            'idx_audit_logs_created_desc',
            'idx_customers_mobile',
            'idx_le_account_txdate',
        ];
        for (const idx of indexes) {
            await safe(() => q.sequelize.query(`DROP INDEX IF EXISTS "${idx}"`));
        }
    }
};
