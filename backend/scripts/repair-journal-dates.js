/**
 * Repair journal dates that were posted on the wrong day.
 *
 * Journal entries used to take their date from new Date(text), which reads
 * the DD-MM-YYYY dates of invoices, customer-ledger receipts and
 * supplier-ledger purchases as American month-day: 04-09-2026 (4 Sep) was
 * posted on 9 Apr, 11-09-2026 on 9 Nov, and 25-09-2026 (invalid that way) on
 * the day it was entered. Separately, a date-only invoice edit left the
 * invoice's journal on its old date. Party ledgers read the documents and look
 * right; journal-based reports (Trial Balance, P&L, Balance Sheet, Cash Book,
 * Day Book, ledger statements) use the journal date and are affected.
 *
 * For every ACTIVE journal batch of an invoice, invoice cash receipt, payment,
 * purchase or legacy migration, this compares the batch's date with its
 * document's date (parsed by the same strict reader the app now uses) and,
 * where they differ, sets the batch and its ledger lines to the document's
 * date. Reversed batches, reversals and payment-status toggles are history and
 * are left alone. Amounts are never touched, so every balance stays the same;
 * only the day the entry sits on changes.
 *
 * Batches whose document is missing, deleted, or has an unreadable date are
 * reported and left alone.
 *
 * Usage (from Invoice/backend/) — take a backup first, and run --apply while the
 * app is stopped (if a date is changed in the app meanwhile, the repair notices,
 * rolls back and asks you to run it again):
 *   node scripts/repair-journal-dates.js           # DRY RUN: report only (default)
 *   node scripts/repair-journal-dates.js --apply   # fix, in one transaction
 */

'use strict';

require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'repair-script-placeholder';

const db = require('../src/models');
const { createAuditLog } = require('../src/middleware/auditLogger');
const { toIsoDate } = require('../src/utils/docDate');

const TYPES = ['INVOICE', 'INVOICE_CASH', 'PAYMENT', 'PURCHASE', 'MIGRATION'];

const select = (sql, replacements = {}, transaction = null) =>
    db.sequelize.query(sql, { replacements, transaction, type: db.sequelize.QueryTypes.SELECT });

/** Work out which active batches sit on a different day from their document. */
async function planRepair() {
    // journal_batches.transactionDate is timestamptz holding UTC midnight of
    // the posted day (written through the DATEONLY model), so read it in UTC.
    const batches = await select(
        `SELECT id, "batchNumber", "referenceType", "referenceId",
                to_char("transactionDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d
           FROM journal_batches
          WHERE "isReversed" = false AND "referenceId" IS NOT NULL AND "referenceType" IN (:types)`,
        { types: TYPES });

    const docs = new Map();
    const load = async (kind, sql) => { for (const r of await select(sql)) docs.set(r.id, { kind, ...r }); };
    await load('invoice', `SELECT id, "orderNumber" AS number, "orderDate" AS date, "isDeleted" FROM orders`);
    await load('payment', `SELECT id, "paymentNumber" AS number, "paymentDate" AS date, "isDeleted" FROM payments`);
    await load('purchase', `SELECT id, "billNumber" AS number, "billDate" AS date, "isDeleted" FROM "purchaseBills"`);

    const fixes = [];
    const skipped = { noDocument: [], deletedDocument: [], unreadableDate: [] };
    for (const b of batches) {
        const doc = docs.get(b.referenceId);
        const row = { batchId: b.id, batchNumber: b.batchNumber, referenceType: b.referenceType, journalDate: b.d };
        if (!doc) { skipped.noDocument.push(row); continue; }
        Object.assign(row, { document: doc.number, documentDate: doc.date });
        if (doc.isDeleted) { skipped.deletedDocument.push(row); continue; }
        const correct = toIsoDate(doc.date);
        if (!correct) { skipped.unreadableDate.push(row); continue; }
        if (b.d !== correct) fixes.push({ ...row, correctDate: correct });
    }
    return { scanned: batches.length, fixes, skipped };
}

/** Apply a plan in one transaction, with one audit record. */
async function applyRepair(plan) {
    if (!plan.fixes.length) return { batches: 0, ledgerLines: 0 };
    return db.sequelize.transaction(async (transaction) => {
        // Group by (planned from-date, to-date). Each UPDATE only touches a batch
        // still on the date it had when the plan was made: if a date was changed
        // in the app since (or is being changed now — the UPDATE waits for that
        // row and re-checks), the batch is not matched, the count check below
        // fails, and the whole repair rolls back instead of writing a stale date.
        const groups = new Map();
        for (const f of plan.fixes) {
            const key = `${f.journalDate}|${f.correctDate}`;
            if (!groups.has(key)) groups.set(key, { from: f.journalDate, to: f.correctDate, ids: [] });
            groups.get(key).ids.push(f.batchId);
        }
        let batches = 0;
        let ledgerLines = 0;
        for (const { from, to, ids } of groups.values()) {
            const [rows] = await db.sequelize.query(
                `UPDATE journal_batches
                    SET "transactionDate" = CAST(:to AS date)::timestamp AT TIME ZONE 'UTC', "updatedAt" = now()
                  WHERE id IN (:ids) AND "isReversed" = false
                    AND to_char("transactionDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD') = :from
              RETURNING id`,
                { replacements: { to, from, ids }, transaction });
            const hit = rows.map((r) => r.id);
            batches += hit.length;
            if (hit.length) {
                const [, l] = await db.sequelize.query(
                    `UPDATE ledger_entries SET "transactionDate" = CAST(:to AS date), "updatedAt" = now() WHERE "batchId" IN (:hit)`,
                    { replacements: { to, hit }, transaction });
                ledgerLines += l.rowCount;
            }
        }
        if (batches !== plan.fixes.length) {
            throw new Error(`${plan.fixes.length - batches} of the planned entries changed since the report was made. ` +
                'Rolled back — nothing changed. Run the script again.');
        }
        const byType = {};
        for (const f of plan.fixes) byType[f.referenceType] = (byType[f.referenceType] || 0) + 1;
        await createAuditLog({
            userName: 'repair-journal-dates script',
            action: 'UPDATE',
            entityType: 'JOURNAL_BATCH',
            description: `Repaired the date of ${batches} journal batches (${ledgerLines} ledger lines) to match their documents`,
            metadata: { byType, sample: plan.fixes.slice(0, 50) },
            transaction,
        });
        return { batches, ledgerLines };
    });
}

function printPlan(plan) {
    const byType = {};
    for (const f of plan.fixes) byType[f.referenceType] = (byType[f.referenceType] || 0) + 1;
    console.log(`Scanned ${plan.scanned} active journal batches.`);
    console.log(`On the wrong day: ${plan.fixes.length}${plan.fixes.length ? ` (${Object.entries(byType).map(([t, n]) => `${t} ${n}`).join(', ')})` : ''}`);
    for (const f of plan.fixes.slice(0, 20)) {
        console.log(`  ${String(f.document).padEnd(22)} document ${String(f.documentDate).padEnd(10)}  journal ${f.journalDate} -> ${f.correctDate}   (${f.referenceType} ${f.batchNumber})`);
    }
    if (plan.fixes.length > 20) console.log(`  ... and ${plan.fixes.length - 20} more`);
    const s = plan.skipped;
    const total = s.noDocument.length + s.deletedDocument.length + s.unreadableDate.length;
    if (total) {
        console.log(`Left alone (needs a look, not changed): ${total}`);
        if (s.deletedDocument.length) console.log(`  ${s.deletedDocument.length} active batches belong to DELETED documents, e.g. ${s.deletedDocument.slice(0, 3).map((r) => r.document).join(', ')}`);
        if (s.unreadableDate.length) console.log(`  ${s.unreadableDate.length} documents have an unreadable date, e.g. ${s.unreadableDate.slice(0, 3).map((r) => `${r.document} "${r.documentDate}"`).join(', ')}`);
        if (s.noDocument.length) console.log(`  ${s.noDocument.length} batches point at no invoice/payment/purchase`);
    }
}

if (require.main === module) {
    const APPLY = process.argv.includes('--apply');
    (async () => {
        const plan = await planRepair();
        printPlan(plan);
        if (!APPLY) {
            console.log('\nDRY RUN — nothing was changed. To fix, take a backup, then run again with --apply.');
        } else if (plan.fixes.length) {
            const r = await applyRepair(plan);
            console.log(`\nFixed ${r.batches} journal batches and ${r.ledgerLines} ledger lines (one audit record written).`);
        } else {
            console.log('\nNothing to fix.');
        }
        await db.sequelize.close();
    })().catch(async (e) => {
        console.error('Repair failed — nothing was changed:', e.message);
        try { await db.sequelize.close(); } catch (_) { /* ignore */ }
        process.exit(1);
    });
}

module.exports = { planRepair, applyRepair };
