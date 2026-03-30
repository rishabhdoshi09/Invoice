/**
 * Bank Account Controller
 * Manage bank/cash accounts + bank reconciliation
 */
const db = require('../models');
const moment = require('moment');

// ─── BANK ACCOUNT CRUD ───────────────────────────────────────────────────────

const getAll = async (req, res) => {
    try {
        const accounts = await db.bankAccount.findAll({ where: { isActive: true }, order: [['name','ASC']] });
        return res.json({ status: 200, data: accounts });
    } catch (err) { return res.status(500).json({ status: 500, message: err.message }); }
};

const create = async (req, res) => {
    try {
        const { name, bankName, accountNumber, ifscCode, branchName, accountType, openingBalance, notes } = req.body;
        if (!name) return res.status(400).json({ status: 400, message: 'Account name required' });
        const account = await db.bankAccount.create({
            name, bankName, accountNumber, ifscCode, branchName,
            accountType: accountType || 'CURRENT',
            openingBalance: Number(openingBalance) || 0,
            currentBalance: Number(openingBalance) || 0,
            notes
        });
        return res.status(201).json({ status: 201, data: account });
    } catch (err) { return res.status(500).json({ status: 500, message: err.message }); }
};

const update = async (req, res) => {
    try {
        const account = await db.bankAccount.findByPk(req.params.id);
        if (!account) return res.status(404).json({ status: 404, message: 'Account not found' });
        await account.update(req.body);
        return res.json({ status: 200, data: account });
    } catch (err) { return res.status(500).json({ status: 500, message: err.message }); }
};

// ─── BANK STATEMENT (IMPORT) ─────────────────────────────────────────────────

const importStatement = async (req, res) => {
    try {
        const { bankAccountId, lines } = req.body;
        if (!bankAccountId || !lines?.length) {
            return res.status(400).json({ status: 400, message: 'bankAccountId and lines required' });
        }

        const created = await db.bankStatementLine.bulkCreate(
            lines.map(l => ({
                bankAccountId,
                txnDate:     l.date || l.txnDate,
                description: l.description || l.narration || '',
                debit:       Number(l.debit)   || 0,
                credit:      Number(l.credit)  || 0,
                balance:     Number(l.balance) || 0,
                referenceNo: l.referenceNo || l.chqNo || null,
                isMatched:   false
            }))
        );

        return res.status(201).json({ status: 201, message: `${created.length} lines imported`, data: { count: created.length } });
    } catch (err) { return res.status(500).json({ status: 500, message: err.message }); }
};

// ─── BANK RECONCILIATION ─────────────────────────────────────────────────────

const getReconciliation = async (req, res) => {
    try {
        const { bankAccountId } = req.params;
        const { from, to } = req.query;

        const account = await db.bankAccount.findByPk(bankAccountId);
        if (!account) return res.status(404).json({ status: 404, message: 'Bank account not found' });

        // Statement lines
        const where = { bankAccountId };
        if (from) where.txnDate = { ...(where.txnDate || {}), [db.Sequelize.Op.gte]: from };
        if (to)   where.txnDate = { ...(where.txnDate || {}), [db.Sequelize.Op.lte]: to };

        const statementLines = await db.bankStatementLine.findAll({
            where, order: [['txnDate', 'ASC'], ['createdAt', 'ASC']]
        });

        // Book entries (payments linked to this bank account)
        const [bookEntries] = await db.sequelize.query(`
            SELECT
                p.id, p."paymentNumber", p."paymentDate", p."partyName",
                p."partyType", p.amount, p.notes, p."chequeNo", p."utrNo",
                p."referenceType", p."referenceNumber"
            FROM payments p
            WHERE p."bankAccountId" = :bankAccountId
              AND p."isDeleted" = false
              ${from ? 'AND p."paymentDate" >= :from' : ''}
              ${to   ? 'AND p."paymentDate" <= :to'   : ''}
            ORDER BY p."paymentDate"
        `, { replacements: { bankAccountId, from, to } });

        const unmatchedStatement = statementLines.filter(l => !l.isMatched);
        const matchedStatement   = statementLines.filter(l =>  l.isMatched);

        const stmtBalance  = statementLines.reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0);
        const bookBalance  = bookEntries.reduce((s, e) => {
            // payments received = credit in bank; payments made = debit
            return s + Number(e.amount);
        }, 0);

        return res.json({
            status: 200,
            data: {
                account: { id: account.id, name: account.name, currentBalance: account.currentBalance },
                period: { from, to },
                statementLines,
                bookEntries,
                unmatchedCount: unmatchedStatement.length,
                matchedCount: matchedStatement.length,
                stmtBalance,
                bookBalance,
                difference: stmtBalance - bookBalance
            }
        });
    } catch (err) { return res.status(500).json({ status: 500, message: err.message }); }
};

const matchStatement = async (req, res) => {
    try {
        const { statementLineId, paymentId } = req.body;
        const line = await db.bankStatementLine.findByPk(statementLineId);
        if (!line) return res.status(404).json({ status: 404, message: 'Statement line not found' });

        await line.update({ isMatched: true, matchedPaymentId: paymentId, matchedAt: new Date() });
        return res.json({ status: 200, message: 'Matched', data: line });
    } catch (err) { return res.status(500).json({ status: 500, message: err.message }); }
};

module.exports = { getAll, create, update, importStatement, getReconciliation, matchStatement };
