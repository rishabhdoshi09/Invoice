'use strict';

/**
 * Edit the notes of a payment or purchase bill (shown in the ledgers as
 * "Payment — <notes>", "Purchase — <notes>").
 *
 * Notes are descriptive only: they are not copied into the journal and no
 * calculation reads them, so nothing else needs to change. The old and new
 * text are kept in the audit log, written in the same transaction.
 */

const db = require('../models');
const { createAuditLog } = require('../middleware/auditLogger');

const MAX_NOTES = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KINDS = {
    payment: { model: () => db.payment, numberField: 'paymentNumber', entityType: 'PAYMENT', label: 'Payment' },
    purchase: { model: () => db.purchaseBill, numberField: 'billNumber', entityType: 'PURCHASE', label: 'Purchase' },
};

class NotesChangeError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// Trimmed text, or null for "no notes".
const normalise = (v) => {
    const s = v == null ? '' : String(v).trim();
    return s === '' ? null : s;
};

/**
 * @param {object} p
 * @param {'payment'|'purchase'} p.kind
 * @param {string} p.id
 * @param {string} p.notes     the new text; empty clears the notes
 * @param {object} [p.user]    req.user, for the audit record
 * @param {object} [p.request] { ipAddress, userAgent }
 */
async function changeDocumentNotes({ kind, id, notes, user = null, request = {} }) {
    const cfg = KINDS[kind];
    if (!cfg) throw new NotesChangeError(400, `Unknown document type: ${kind}`);
    if (!UUID_RE.test(String(id || ''))) throw new NotesChangeError(404, `${cfg.label} not found.`);
    if (notes !== null && notes !== undefined && typeof notes !== 'string') {
        throw new NotesChangeError(400, 'Notes must be text.');
    }
    const newNotes = normalise(notes);
    if (newNotes && newNotes.length > MAX_NOTES) {
        throw new NotesChangeError(400, `Notes can be at most ${MAX_NOTES} characters.`);
    }

    return db.sequelize.transaction(async (transaction) => {
        const doc = await cfg.model().findOne({ where: { id }, transaction, lock: transaction.LOCK.UPDATE });
        if (!doc) throw new NotesChangeError(404, `${cfg.label} not found.`);
        if (doc.isDeleted) throw new NotesChangeError(400, `This ${cfg.label.toLowerCase()} has been deleted.`);

        const oldNotes = normalise(doc.notes);
        const number = doc[cfg.numberField];
        if (oldNotes === newNotes) return { id, number, changed: false, notes: oldNotes };

        await doc.update({ notes: newNotes }, { transaction });
        await createAuditLog({
            userId: user && user.id,
            userName: user && (user.name || user.username),
            userRole: user && user.role,
            action: 'UPDATE',
            entityType: cfg.entityType,
            entityId: id,
            entityName: number,
            oldValues: { notes: oldNotes },
            newValues: { notes: newNotes },
            description: `${cfg.label} ${number || id} notes changed`,
            ipAddress: request.ipAddress,
            userAgent: request.userAgent,
            transaction,
        });
        return { id, number, changed: true, notes: newNotes };
    });
}

module.exports = { changeDocumentNotes, NotesChangeError, MAX_NOTES };
