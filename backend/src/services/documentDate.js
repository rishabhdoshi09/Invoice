'use strict';

/**
 * Move a payment or purchase bill to another date.
 *
 * A document's date is copied into several places when it is posted, and they
 * must move together or the books disagree with each other:
 *   - the document itself (paymentDate / billDate)
 *   - its ACTIVE journal batch, and that batch's ledger lines (each line
 *     carries the date for date-range reports)
 *   - for a purchase, the stock movements it created
 * Amounts never change, so balances and allocations are unaffected; the move
 * is done in place (as when a voucher's date is corrected in Tally) rather
 * than by a reversal, which this codebase dates "today" and which would add
 * two offsetting entries to today's reports. The old and new date are kept in
 * the audit log, written in the same transaction.
 */

const db = require('../models');
const { createAuditLog } = require('../middleware/auditLogger');
const { toIsoDate, isoToDmy, localIso } = require('../utils/docDate');

// MIGRATION batches are the same document's entries from the legacy ledger
// migration (keyed by the document's own id, e.g. a purchase and its
// "Payment for Purchase" leg), so they move with it.
const KINDS = {
    payment: {
        model: () => db.payment,
        dateField: 'paymentDate',
        numberField: 'paymentNumber',
        referenceTypes: ['PAYMENT', 'MIGRATION'],
        stockReferenceType: null,
        entityType: 'PAYMENT',
        label: 'Payment',
        // The party whose opening balance date bounds this document.
        party: (doc) => {
            const model = { supplier: db.supplier, customer: db.customer }[doc.partyType];
            return model ? { model, id: doc.partyId } : null; // expense/employee: no opening balance
        },
    },
    purchase: {
        model: () => db.purchaseBill,
        dateField: 'billDate',
        numberField: 'billNumber',
        referenceTypes: ['PURCHASE', 'MIGRATION'],
        stockReferenceType: 'purchase',
        entityType: 'PURCHASE',
        label: 'Purchase',
        party: (doc) => ({ model: db.supplier, id: doc.supplierId }),
    },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class DateChangeError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/**
 * Move the dates of a document's active journal batches (and their ledger
 * lines) and stock movements. Shared with the invoice edit path.
 */
async function moveLinkedDates({ referenceTypes, referenceId, stockReferenceType, iso, transaction }) {
    const batches = !referenceTypes.length ? [] : await db.journalBatch.findAll({
        where: { referenceType: referenceTypes, referenceId, isReversed: false },
        attributes: ['id'],
        transaction,
    });
    const batchIds = batches.map((b) => b.id);
    let ledgerLines = 0;
    if (batchIds.length) {
        await db.journalBatch.update({ transactionDate: iso }, { where: { id: batchIds }, transaction });
        // validate:false — a bulk update validates a row built from ONLY the new
        // values, so debit/credit default to 0 and the model's amount rule
        // ("either debit or credit") rejects it. Only the date changes here.
        [ledgerLines] = await db.ledgerEntry.update(
            { transactionDate: iso },
            { where: { batchId: batchIds }, transaction, validate: false }
        );
    }
    let stockMovements = 0;
    if (stockReferenceType) {
        [stockMovements] = await db.stockTransaction.update(
            { transactionDate: iso },
            { where: { referenceId, referenceType: stockReferenceType }, transaction }
        );
    }
    return { journalBatches: batchIds.length, ledgerLines, stockMovements };
}

/**
 * @param {object} p
 * @param {'payment'|'purchase'} p.kind
 * @param {string} p.id
 * @param {string} p.newDate  any supported format; the picker sends YYYY-MM-DD
 * @param {object} [p.user]   req.user, for the audit record
 * @param {object} [p.request] { ipAddress, userAgent }
 */
async function changeDocumentDate({ kind, id, newDate, user = null, request = {} }) {
    const cfg = KINDS[kind];
    if (!cfg) throw new DateChangeError(400, `Unknown document type: ${kind}`);
    if (!UUID_RE.test(String(id || ''))) throw new DateChangeError(404, `${cfg.label} not found.`);

    const iso = toIsoDate(newDate);
    if (!iso) throw new DateChangeError(400, 'Please choose a valid date.');
    if (iso > localIso(new Date())) throw new DateChangeError(400, 'The date cannot be in the future.');
    if (iso < '2000-01-01') throw new DateChangeError(400, 'Please choose a valid date.');

    return db.sequelize.transaction(async (transaction) => {
        const doc = await cfg.model().findOne({ where: { id }, transaction, lock: transaction.LOCK.UPDATE });
        if (!doc) throw new DateChangeError(404, `${cfg.label} not found.`);
        if (doc.isDeleted) throw new DateChangeError(400, `This ${cfg.label.toLowerCase()} has been deleted.`);

        const oldStored = doc[cfg.dateField];
        const number = doc[cfg.numberField];
        if (toIsoDate(oldStored) === iso) {
            return { id, number, changed: false, oldDate: oldStored, newDate: oldStored };
        }

        // An opening balance already sums up everything before its date, so a
        // document moved before it would be counted twice.
        const party = cfg.party(doc);
        if (party && party.id) {
            const p = await party.model.findByPk(party.id, { attributes: ['name', 'openingBalanceDate'], transaction });
            const obIso = p && toIsoDate(p.openingBalanceDate);
            if (obIso && iso < obIso) {
                throw new DateChangeError(400,
                    `This date is before ${p.name}'s opening balance date (${isoToDmy(obIso).replace(/-/g, '/')}). ` +
                    'Entries before that date are already included in the opening balance.');
            }
        }

        // Store the canonical DD-MM-YYYY: new payments are normalised to it
        // (dao/payment.js), and some screens read only that format.
        const newStored = isoToDmy(iso);
        await doc.update({ [cfg.dateField]: newStored }, { transaction });

        const moved = await moveLinkedDates({
            referenceTypes: cfg.referenceTypes,
            referenceId: id,
            stockReferenceType: cfg.stockReferenceType,
            iso,
            transaction,
        });

        await createAuditLog({
            userId: user && user.id,
            userName: user && (user.name || user.username),
            userRole: user && user.role,
            action: 'UPDATE',
            entityType: cfg.entityType,
            entityId: id,
            entityName: number,
            oldValues: { [cfg.dateField]: oldStored },
            newValues: { [cfg.dateField]: newStored },
            description: `${cfg.label} ${number || id} date changed from ${oldStored || '(none)'} to ${newStored}`,
            ipAddress: request.ipAddress,
            userAgent: request.userAgent,
            metadata: moved,
            transaction,
        });

        return { id, number, changed: true, oldDate: oldStored, newDate: newStored, ...moved };
    });
}

module.exports = { changeDocumentDate, moveLinkedDates, DateChangeError };
