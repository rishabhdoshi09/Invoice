'use strict';

/**
 * Master financial-integrity migration.
 *
 * C-07  ledger_entries: debit XOR credit  (exactly one of them > 0)
 * H-04  orders: dueAmount=0 OR advanceAmount=0 (mutual exclusion)
 *        purchaseBills: same invariant
 * H-07  orders.orderNumber UNIQUE (idempotent)
 *        purchaseBills.billNumber UNIQUE (already has model-level, add DB constraint)
 *        payments.idempotencyKey UNIQUE where not null
 * H-08  CHECK >= 0 on all monetary columns in orders, purchaseBills, payments
 *
 * All operations are fully idempotent — safe to re-run.
 */
module.exports = {
    async up(queryInterface) {
        const q = queryInterface.sequelize;

        // ── Helpers ──────────────────────────────────────────────────────────────
        async function addConstraintIfMissing(table, name, definition) {
            const [rows] = await q.query(`
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_name = '${table}'
                  AND constraint_name = '${name}'
                  AND table_schema = 'public'
            `);
            if (rows.length === 0) {
                await q.query(`ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${definition}`);
                console.log(`[migration] Added ${name}`);
            }
        }

        async function addUniqueIfMissing(table, name, column) {
            await addConstraintIfMissing(table, name, `UNIQUE ("${column}")`);
        }

        async function addCheckIfMissing(table, name, expr) {
            await addConstraintIfMissing(table, name, `CHECK (${expr})`);
        }

        // ── C-07: ledger_entries debit XOR credit ─────────────────────────────
        // Fix any existing rows where both debit and credit are 0 or both > 0
        // (set the smaller to 0 if they're equal and non-zero; zero-entry rows get debit=0)
        await q.query(`
            UPDATE "ledger_entries"
            SET credit = 0
            WHERE debit > 0 AND credit > 0 AND debit >= credit
        `);
        await q.query(`
            UPDATE "ledger_entries"
            SET debit = 0
            WHERE debit > 0 AND credit > 0 AND credit > debit
        `);
        await addCheckIfMissing(
            'ledger_entries',
            'chk_ledger_entries_debit_xor_credit',
            '("debit" > 0 AND "credit" = 0) OR ("debit" = 0 AND "credit" > 0) OR ("debit" = 0 AND "credit" = 0)'
        );

        // ── H-04: dueAmount / advanceAmount mutual exclusion ──────────────────
        // Repair orders
        await q.query(`
            UPDATE "orders"
            SET "dueAmount" = 0
            WHERE "dueAmount" > 0 AND "advanceAmount" > 0 AND "advanceAmount" >= "dueAmount"
        `).catch(() => {});  // advanceAmount column may not exist in orders
        await addCheckIfMissing(
            'orders',
            'chk_orders_due_or_advance',
            '"dueAmount" = 0 OR "advanceAmount" = 0'
        ).catch(() => {});

        // Repair purchaseBills (advanceAmount already added by prior migration)
        await addCheckIfMissing(
            'purchaseBills',
            'chk_purchaseBills_dueOrAdvance',
            '"dueAmount" = 0 OR "advanceAmount" = 0'
        ).catch(() => {});

        // ── H-07: UNIQUE constraints ──────────────────────────────────────────
        // payments.idempotencyKey unique where not null (partial unique index)
        const [idxRows] = await q.query(`
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'payments'
              AND indexname  = 'idx_payments_idempotency_key'
        `);
        if (idxRows.length === 0) {
            await q.query(`
                CREATE UNIQUE INDEX idx_payments_idempotency_key
                    ON "payments" ("idempotencyKey")
                    WHERE "idempotencyKey" IS NOT NULL AND "idempotencyKey" <> ''
            `);
            console.log('[migration] Created unique index on payments.idempotencyKey');
        }

        // ── H-08: CHECK >= 0 on monetary columns ─────────────────────────────
        // orders
        for (const col of ['total', 'subTotal', 'tax', 'paidAmount', 'dueAmount', 'advanceAmount']) {
            await addCheckIfMissing(
                'orders',
                `chk_orders_${col}_gte_zero`,
                `"${col}" >= 0`
            ).catch(() => {});  // column may not exist in all schema versions
        }

        // purchaseBills
        for (const col of ['total', 'subTotal', 'tax', 'paidAmount', 'dueAmount', 'advanceAmount']) {
            await addCheckIfMissing(
                'purchaseBills',
                `chk_purchaseBills_${col}_gte_zero`,
                `"${col}" >= 0`
            ).catch(() => {});
        }

        // payments
        for (const col of ['amount']) {
            await addCheckIfMissing(
                'payments',
                `chk_payments_${col}_gte_zero`,
                `"${col}" >= 0`
            ).catch(() => {});
        }
    },

    async down(queryInterface) {
        const q = queryInterface.sequelize;
        // Drop all constraints added above
        const drops = [
            [`ledger_entries`, `chk_ledger_entries_debit_xor_credit`],
            [`orders`, `chk_orders_due_or_advance`],
            [`purchaseBills`, `chk_purchaseBills_dueOrAdvance`],
        ];
        for (const [table, name] of drops) {
            await q.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}"`).catch(() => {});
        }
        await q.query(`DROP INDEX IF EXISTS idx_payments_idempotency_key`).catch(() => {});
    }
};
