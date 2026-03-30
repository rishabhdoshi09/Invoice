/**
 * Journal Voucher Controller
 * Tally-equivalent: Journal, Contra, manual Payment/Receipt vouchers
 */
const db = require('../models');
const { randomUUID } = require('crypto');
const moment = require('moment');

const generateVoucherNumber = async (type) => {
    const prefixMap = { JOURNAL: 'JNL', CONTRA: 'CTR', PAYMENT: 'MPV', RECEIPT: 'MRV' };
    const prefix = prefixMap[type] || 'JV';
    const year   = moment().format('YYYYMM');
    const [rows] = await db.sequelize.query(
        `SELECT COUNT(*) AS cnt FROM journal_vouchers WHERE "voucherType" = :type AND EXTRACT(YEAR FROM "voucherDate") = :yr`,
        { replacements: { type, yr: moment().year() } }
    );
    const seq = parseInt(rows[0].cnt) + 1;
    return `${prefix}/${year}/${String(seq).padStart(4,'0')}`;
};

const createJournalVoucher = async (req, res) => {
    try {
        const { voucherDate, voucherType, narration, lines } = req.body;

        if (!lines || lines.length < 2) {
            return res.status(400).json({ status: 400, message: 'Minimum 2 lines required for a journal entry' });
        }

        const totalDebit  = lines.reduce((s, l) => s + (Number(l.debit)  || 0), 0);
        const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            return res.status(400).json({
                status: 400,
                message: `Voucher not balanced: DR ${totalDebit.toFixed(2)} ≠ CR ${totalCredit.toFixed(2)}`
            });
        }

        const result = await db.sequelize.transaction(async (transaction) => {
            const voucherNumber = await generateVoucherNumber(voucherType || 'JOURNAL');

            // Create the ledger batch first
            const LedgerService = require('../services/ledgerService');
            const ledgerSvc = new LedgerService(db);

            const batchResult = await ledgerSvc.createJournalBatch({
                referenceType: 'JOURNAL',
                referenceId: null,
                description: narration || voucherNumber,
                transactionDate: voucherDate || moment().format('YYYY-MM-DD'),
                entries: lines.map(l => ({
                    accountId: l.accountId,
                    debit:  Number(l.debit)  || 0,
                    credit: Number(l.credit) || 0,
                    narration: l.narration || narration || ''
                }))
            }, transaction);

            // Create the journal voucher header
            const voucher = await db.journalVoucher.create({
                voucherNumber,
                voucherDate:  voucherDate || moment().format('YYYY-MM-DD'),
                voucherType:  voucherType || 'JOURNAL',
                narration,
                totalDebit,
                totalCredit,
                batchId:      batchResult.batch.id,
                createdBy:    req.user?.id,
                createdByName:req.user?.name || req.user?.username
            }, { transaction });

            // Create lines
            const voucherLines = await db.journalVoucherLine.bulkCreate(
                lines.map(l => ({
                    voucherId:    voucher.id,
                    accountId:    l.accountId,
                    accountName:  l.accountName || '',
                    debit:        Number(l.debit)  || 0,
                    credit:       Number(l.credit) || 0,
                    narration:    l.narration || '',
                    costCenterId: l.costCenterId || null
                })),
                { transaction }
            );

            return { voucher, lines: voucherLines, batchNumber: batchResult.batch.batchNumber };
        });

        return res.status(201).json({ status: 201, message: 'Journal voucher created', data: result });
    } catch (err) {
        console.error('Journal voucher error:', err);
        return res.status(500).json({ status: 500, message: err.message });
    }
};

const getJournalVouchers = async (req, res) => {
    try {
        const { from, to, type } = req.query;
        const where = { isDeleted: false };
        if (type) where.voucherType = type;

        const vouchers = await db.journalVoucher.findAll({
            where,
            include: [{ model: db.journalVoucherLine, as: 'lines' }],
            order: [['voucherDate', 'DESC'], ['createdAt', 'DESC']],
            limit: parseInt(req.query.limit || 100),
            offset: parseInt(req.query.offset || 0)
        });

        return res.json({ status: 200, data: vouchers });
    } catch (err) {
        return res.status(500).json({ status: 500, message: err.message });
    }
};

const getJournalVoucher = async (req, res) => {
    try {
        const voucher = await db.journalVoucher.findOne({
            where: { id: req.params.id, isDeleted: false },
            include: [{ model: db.journalVoucherLine, as: 'lines', include: [{ model: db.account }] }]
        });
        if (!voucher) return res.status(404).json({ status: 404, message: 'Voucher not found' });
        return res.json({ status: 200, data: voucher });
    } catch (err) {
        return res.status(500).json({ status: 500, message: err.message });
    }
};

const deleteJournalVoucher = async (req, res) => {
    try {
        if (req.user?.role !== 'admin') return res.status(403).json({ status: 403, message: 'Admin only' });

        const voucher = await db.journalVoucher.findByPk(req.params.id);
        if (!voucher || voucher.isDeleted) return res.status(404).json({ status: 404, message: 'Voucher not found' });

        await db.sequelize.transaction(async (transaction) => {
            // Reverse the associated journal batch
            if (voucher.batchId) {
                const batch = await db.journalBatch.findByPk(voucher.batchId, { transaction });
                if (batch && !batch.isReversed) {
                    const entries = await db.ledgerEntry.findAll({ where: { batchId: batch.id }, transaction });
                    const LedgerService = require('../services/ledgerService');
                    const ledgerSvc = new LedgerService(db);
                    await ledgerSvc.createJournalBatch({
                        referenceType: 'REVERSAL',
                        referenceId: voucher.id,
                        description: `Reversal of ${voucher.voucherNumber}`,
                        transactionDate: moment().format('YYYY-MM-DD'),
                        entries: entries.map(e => ({
                            accountId: e.accountId,
                            debit:  Number(e.credit) || 0,
                            credit: Number(e.debit)  || 0,
                            narration: `Rev: ${e.narration || ''}`
                        }))
                    }, transaction);
                    await batch.update({ isReversed: true }, { transaction });
                }
            }
            await voucher.update({ isDeleted: true }, { transaction });
        });

        return res.json({ status: 200, message: 'Journal voucher reversed and deleted' });
    } catch (err) {
        return res.status(500).json({ status: 500, message: err.message });
    }
};

module.exports = { createJournalVoucher, getJournalVouchers, getJournalVoucher, deleteJournalVoucher };
