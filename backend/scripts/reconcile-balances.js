/**
 * Reconcile customers.currentBalance / suppliers.currentBalance against the
 * canonical computed balance (services/partyBalance.js).
 *
 * These columns are incremented imperatively by many code paths (order
 * create, payment record, toggles, confirm-link, deletes) and drift over
 * time. Pages compute balances live from transactions, but the columns are
 * still read by the create-order link prompt, delete guards, and advance
 * capping — so they must match the computed truth.
 *
 * Prints every drifted party (stored vs computed) and fixes it. Safe to run
 * any time; run after hours if you want zero write contention.
 *
 * Usage (from Invoice/backend/):
 *   node scripts/reconcile-balances.js            # report AND fix
 *   node scripts/reconcile-balances.js --dry-run  # report only
 */

'use strict';

require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'reconcile-script-placeholder';

const db = require('../src/models');
const { computeCustomerOutstandings, computeSupplierOutstandings } = require('../src/services/partyBalance');

const DRY_RUN = process.argv.includes('--dry-run');
const fmt = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

async function reconcile(kind, computedRows, model, idKey, nameKey) {
    console.log(`=== ${kind} balance reconciliation ===`);
    const stored = await model.findAll({ raw: true });
    const storedById = new Map(stored.map(r => [r.id, r]));

    let drifted = 0, fixed = 0;
    for (const row of computedRows) {
        const dbRow = storedById.get(row[idKey]);
        if (!dbRow) continue;
        const current = Math.round((Number(dbRow.currentBalance) || 0) * 100) / 100;
        if (Math.abs(current - row.balance) <= 0.01) continue;

        drifted++;
        console.log(`  ${row[nameKey]}: stored ${fmt(current)} → computed ${fmt(row.balance)} (drift ${fmt(row.balance - current)})`);
        if (!DRY_RUN) {
            await model.update(
                { currentBalance: row.balance },
                { where: { id: row[idKey] } }
            );
            fixed++;
        }
    }
    console.log(`${kind}: ${computedRows.length} checked, ${drifted} drifted${DRY_RUN ? ' (dry run — nothing written)' : `, ${fixed} fixed`}.\n`);
}

async function main() {
    await db.sequelize.authenticate();
    console.log(`DB connected. Mode: ${DRY_RUN ? 'DRY RUN' : 'FIX'}\n`);

    await reconcile('Customer', await computeCustomerOutstandings(), db.customer, 'customerId', 'customerName');
    await reconcile('Supplier', await computeSupplierOutstandings(), db.supplier, 'supplierId', 'supplierName');

    console.log('Reconciliation complete.');
    process.exit(0);
}

main().catch(err => {
    console.error('Reconciliation failed:', err);
    process.exit(1);
});
