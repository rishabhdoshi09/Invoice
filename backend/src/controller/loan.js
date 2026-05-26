const db = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');

const generateLoanNumber = async () => {
    const count = await db.loan.count();
    const seq = String(count + 1).padStart(4, '0');
    return `LN-${moment().format('YYYYMM')}-${seq}`;
};

module.exports = {
    listLoans: async (req, res) => {
        try {
            const { type, status, search } = req.query;
            const where = { isDeleted: false };
            if (type) where.type = type;
            if (status) where.status = status;
            if (search) where.partyName = { [Op.iLike]: `%${search}%` };

            const loans = await db.loan.findAll({
                where,
                include: [{ model: db.loanTransaction, as: 'transactions', order: [['createdAt', 'ASC']] }],
                order: [['createdAt', 'DESC']]
            });

            const summary = {
                totalGiven: 0, totalGivenBalance: 0,
                totalReceived: 0, totalReceivedBalance: 0
            };
            loans.forEach(l => {
                if (l.type === 'given') {
                    summary.totalGiven += Number(l.principalAmount);
                    summary.totalGivenBalance += Number(l.balanceAmount);
                } else {
                    summary.totalReceived += Number(l.principalAmount);
                    summary.totalReceivedBalance += Number(l.balanceAmount);
                }
            });

            res.json({ status: 200, data: { rows: loans, summary } });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    createLoan: async (req, res) => {
        try {
            const { type, partyName, partyMobile, principalAmount, loanDate, notes } = req.body;
            if (!type || !partyName || !principalAmount || !loanDate) {
                return res.status(400).json({ status: 400, message: 'type, partyName, principalAmount, loanDate are required.' });
            }
            const loanNumber = await generateLoanNumber();
            const loan = await db.loan.create({
                loanNumber,
                type,
                partyName: partyName.trim(),
                partyMobile: partyMobile?.trim() || null,
                principalAmount: Number(principalAmount),
                balanceAmount: Number(principalAmount),
                loanDate,
                notes: notes?.trim() || null,
                status: 'active'
            });
            res.status(201).json({ status: 201, data: loan });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    getLoan: async (req, res) => {
        try {
            const loan = await db.loan.findOne({
                where: { id: req.params.loanId, isDeleted: false },
                include: [{ model: db.loanTransaction, as: 'transactions', order: [['createdAt', 'ASC']] }]
            });
            if (!loan) return res.status(404).json({ status: 404, message: 'Loan not found.' });
            res.json({ status: 200, data: loan });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    updateLoan: async (req, res) => {
        try {
            const loan = await db.loan.findOne({ where: { id: req.params.loanId, isDeleted: false } });
            if (!loan) return res.status(404).json({ status: 404, message: 'Loan not found.' });
            const { partyName, partyMobile, loanDate, notes } = req.body;
            await loan.update({
                partyName: partyName?.trim() || loan.partyName,
                partyMobile: partyMobile?.trim() ?? loan.partyMobile,
                loanDate: loanDate || loan.loanDate,
                notes: notes?.trim() ?? loan.notes
            });
            res.json({ status: 200, data: loan });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    deleteLoan: async (req, res) => {
        try {
            const loan = await db.loan.findOne({ where: { id: req.params.loanId, isDeleted: false } });
            if (!loan) return res.status(404).json({ status: 404, message: 'Loan not found.' });
            await loan.update({
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy: req.user?.id || null,
                deletedByName: req.user?.name || req.user?.username || null
            });
            res.json({ status: 200, message: 'Loan deleted.' });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    recordRepayment: async (req, res) => {
        try {
            const loan = await db.loan.findOne({ where: { id: req.params.loanId, isDeleted: false } });
            if (!loan) return res.status(404).json({ status: 404, message: 'Loan not found.' });
            if (loan.status === 'settled') return res.status(400).json({ status: 400, message: 'Loan already settled.' });

            const { amount, transactionDate, notes } = req.body;
            const repayAmt = Number(amount);
            if (!repayAmt || repayAmt <= 0) return res.status(400).json({ status: 400, message: 'amount must be positive.' });
            if (repayAmt > Number(loan.balanceAmount)) {
                return res.status(400).json({ status: 400, message: `Amount exceeds outstanding balance of ₹${loan.balanceAmount}.` });
            }

            const txn = await db.loanTransaction.create({
                loanId: loan.id,
                amount: repayAmt,
                transactionDate: transactionDate || moment().format('DD-MM-YYYY'),
                notes: notes?.trim() || null,
                recordedBy: req.user?.name || req.user?.username || null
            });

            const newBalance = Number(loan.balanceAmount) - repayAmt;
            await loan.update({
                balanceAmount: newBalance,
                status: newBalance <= 0 ? 'settled' : 'active'
            });

            res.json({ status: 200, data: { transaction: txn, loan } });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    deleteRepayment: async (req, res) => {
        try {
            const txn = await db.loanTransaction.findOne({ where: { id: req.params.txnId } });
            if (!txn) return res.status(404).json({ status: 404, message: 'Transaction not found.' });

            const loan = await db.loan.findOne({ where: { id: txn.loanId, isDeleted: false } });
            if (!loan) return res.status(404).json({ status: 404, message: 'Parent loan not found.' });

            const restored = Number(loan.balanceAmount) + Number(txn.amount);
            await loan.update({
                balanceAmount: restored,
                status: 'active'
            });
            await txn.destroy();

            res.json({ status: 200, message: 'Repayment deleted and balance restored.' });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    }
};
