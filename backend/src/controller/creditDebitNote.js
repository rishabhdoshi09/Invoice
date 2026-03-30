/**
 * Credit Note & Debit Note Controller
 * Credit Note = Sales Return / Customer refund
 * Debit Note  = Purchase Return / Supplier debit
 */
const db = require('../models');
const moment = require('moment');
const { randomUUID } = require('crypto');

const generateNoteNumber = async (model, prefix) => {
    const year = moment().format('YYMM');
    const count = await model.count();
    return `${prefix}/${year}/${String(count + 1).padStart(4, '0')}`;
};

// ─── CREDIT NOTE ─────────────────────────────────────────────────────────────

const createCreditNote = async (req, res) => {
    try {
        const { noteDate, partyId, partyName, partyType, againstOrderId, againstBillId, reason, items } = req.body;

        if (!items?.length) return res.status(400).json({ status: 400, message: 'Items required' });

        const subTotal = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
        const cgst = items.reduce((s, i) => s + (Number(i.cgst) || 0), 0);
        const sgst = items.reduce((s, i) => s + (Number(i.sgst) || 0), 0);
        const igst = items.reduce((s, i) => s + (Number(i.igst) || 0), 0);
        const total = subTotal + cgst + sgst + igst;

        const note = await db.sequelize.transaction(async (transaction) => {
            const noteNumber = await generateNoteNumber(db.creditNote, 'CN');

            const created = await db.creditNote.create({
                noteNumber, noteDate: noteDate || moment().format('YYYY-MM-DD'),
                partyId, partyName, partyType: partyType || 'customer',
                againstOrderId, againstBillId, reason,
                subTotal, cgst, sgst, igst, total,
                createdBy: req.user?.id, createdByName: req.user?.name || req.user?.username
            }, { transaction });

            // Post to ledger: DR Sales Revenue, CR Customer Receivable
            const coaExists = await db.account.count({ transaction });
            if (coaExists > 0) {
                const LedgerService = require('../services/ledgerService');
                const ledgerSvc = new LedgerService(db);
                const salesAccount = await db.account.findOne({ where: { code: '4100' }, transaction });
                const customerAccount = await ledgerSvc.getOrCreateCustomerAccount(partyId || null, partyName || 'Walk-in', transaction);

                if (salesAccount) {
                    await ledgerSvc.createJournalBatch({
                        referenceType: 'JOURNAL',
                        referenceId: created.id,
                        description: `Credit Note ${noteNumber} — ${partyName}`,
                        transactionDate: noteDate || moment().format('YYYY-MM-DD'),
                        entries: [
                            { accountId: salesAccount.id,   debit: total, credit: 0, narration: `Credit Note ${noteNumber}` },
                            { accountId: customerAccount.id, debit: 0, credit: total, narration: `Credit Note ${noteNumber}` }
                        ]
                    }, transaction);
                }
            }

            return created;
        });

        return res.status(201).json({ status: 201, message: 'Credit note created', data: note });
    } catch (err) {
        console.error('Credit note error:', err);
        return res.status(500).json({ status: 500, message: err.message });
    }
};

const getCreditNotes = async (req, res) => {
    try {
        const { from, to, partyId } = req.query;
        const where = { isDeleted: false };
        if (partyId) where.partyId = partyId;

        const notes = await db.creditNote.findAll({
            where,
            order: [['noteDate', 'DESC']],
            limit: parseInt(req.query.limit || 100),
            offset: parseInt(req.query.offset || 0)
        });
        return res.json({ status: 200, data: notes });
    } catch (err) { return res.status(500).json({ status: 500, message: err.message }); }
};

// ─── DEBIT NOTE ──────────────────────────────────────────────────────────────

const createDebitNote = async (req, res) => {
    try {
        const { noteDate, partyId, partyName, partyType, againstOrderId, againstBillId, reason, items } = req.body;

        if (!items?.length) return res.status(400).json({ status: 400, message: 'Items required' });

        const subTotal = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
        const cgst = items.reduce((s, i) => s + (Number(i.cgst) || 0), 0);
        const sgst = items.reduce((s, i) => s + (Number(i.sgst) || 0), 0);
        const igst = items.reduce((s, i) => s + (Number(i.igst) || 0), 0);
        const total = subTotal + cgst + sgst + igst;

        const note = await db.sequelize.transaction(async (transaction) => {
            const noteNumber = await generateNoteNumber(db.debitNote, 'DN');

            const created = await db.debitNote.create({
                noteNumber, noteDate: noteDate || moment().format('YYYY-MM-DD'),
                partyId, partyName, partyType: partyType || 'supplier',
                againstOrderId, againstBillId, reason,
                subTotal, cgst, sgst, igst, total,
                createdBy: req.user?.id, createdByName: req.user?.name || req.user?.username
            }, { transaction });

            // Post to ledger: DR Supplier Payable, CR Purchase Expense
            const coaExists = await db.account.count({ transaction });
            if (coaExists > 0) {
                const LedgerService = require('../services/ledgerService');
                const ledgerSvc = new LedgerService(db);
                const purchaseAccount = await db.account.findOne({ where: { code: '5300' }, transaction });
                const supplierAccount = await ledgerSvc.getOrCreateSupplierAccount(partyId || null, partyName || 'Unknown', transaction);

                if (purchaseAccount) {
                    await ledgerSvc.createJournalBatch({
                        referenceType: 'JOURNAL',
                        referenceId: created.id,
                        description: `Debit Note ${noteNumber} — ${partyName}`,
                        transactionDate: noteDate || moment().format('YYYY-MM-DD'),
                        entries: [
                            { accountId: supplierAccount.id,  debit: total, credit: 0, narration: `Debit Note ${noteNumber}` },
                            { accountId: purchaseAccount.id,  debit: 0, credit: total, narration: `Debit Note ${noteNumber}` }
                        ]
                    }, transaction);
                }
            }

            return created;
        });

        return res.status(201).json({ status: 201, message: 'Debit note created', data: note });
    } catch (err) {
        console.error('Debit note error:', err);
        return res.status(500).json({ status: 500, message: err.message });
    }
};

const getDebitNotes = async (req, res) => {
    try {
        const notes = await db.debitNote.findAll({
            where: { isDeleted: false },
            order: [['noteDate', 'DESC']],
            limit: parseInt(req.query.limit || 100),
            offset: parseInt(req.query.offset || 0)
        });
        return res.json({ status: 200, data: notes });
    } catch (err) { return res.status(500).json({ status: 500, message: err.message }); }
};

module.exports = { createCreditNote, getCreditNotes, createDebitNote, getDebitNotes };
