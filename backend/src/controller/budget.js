/**
 * Budget Controller — Tally Budget + Variance Analysis
 */
const db = require('../models');
const moment = require('moment');

const currentFY = () => {
    const m = moment().month() + 1;
    const y = moment().year();
    return m >= 4 ? `${y}-${y+1}` : `${y-1}-${y}`;
};

const createBudget = async (req, res) => {
    try {
        const { name, financialYear, accountId, accountName, period, month, quarter, budgetedAmount } = req.body;
        if (!accountId || !budgetedAmount) return res.status(400).json({ status: 400, message: 'accountId and budgetedAmount required' });

        const budget = await db.budget.create({
            name: name || `Budget ${financialYear || currentFY()}`,
            financialYear: financialYear || currentFY(),
            accountId, accountName,
            period: period || 'MONTHLY',
            month: month || null,
            quarter: quarter || null,
            budgetedAmount: Number(budgetedAmount),
            actualAmount: 0,
            variance: Number(budgetedAmount)
        });
        return res.status(201).json({ status: 201, data: budget });
    } catch (err) { return res.status(500).json({ status: 500, message: err.message }); }
};

const getBudgetVariance = async (req, res) => {
    try {
        const fy = req.query.fy || currentFY();
        const [fyStart, fyEnd] = fy.includes('-')
            ? [`${fy.split('-')[0]}-04-01`, `${fy.split('-')[1]}-03-31`]
            : [`${fy}-04-01`, `${parseInt(fy)+1}-03-31`];

        const budgets = await db.budget.findAll({ where: { financialYear: fy } });
        if (!budgets.length) return res.json({ status: 200, data: [] });

        const accountIds = [...new Set(budgets.map(b => b.accountId))];

        const [actuals] = await db.sequelize.query(`
            SELECT
                le."accountId",
                COALESCE(SUM(le.debit),  0) AS total_dr,
                COALESCE(SUM(le.credit), 0) AS total_cr,
                EXTRACT(MONTH FROM jb."transactionDate") AS month
            FROM ledger_entries le
            INNER JOIN journal_batches jb ON le."batchId" = jb.id
            WHERE le."accountId" IN (:accountIds)
              AND jb."isPosted" = true AND jb."isReversed" = false
              AND jb."transactionDate" BETWEEN :from AND :to
            GROUP BY le."accountId", EXTRACT(MONTH FROM jb."transactionDate")
        `, { replacements: { accountIds, from: fyStart, to: fyEnd } });

        const actualMap = {};
        actuals.forEach(a => {
            const key = `${a.accountId}_${a.month}`;
            actualMap[key] = (Number(a.total_dr) - Number(a.total_cr));
        });

        const result = budgets.map(b => {
            const key = `${b.accountId}_${b.month}`;
            const actual = actualMap[key] || 0;
            const variance = b.budgetedAmount - actual;
            const variancePct = b.budgetedAmount > 0 ? ((variance / b.budgetedAmount) * 100).toFixed(1) : 0;
            return {
                ...b.toJSON(),
                actualAmount: actual,
                variance,
                variancePercent: variancePct,
                status: Math.abs(variance) < b.budgetedAmount * 0.05 ? 'ON_TRACK'
                      : variance < 0 ? 'OVER_BUDGET' : 'UNDER_BUDGET'
            };
        });

        const summary = {
            totalBudgeted: result.reduce((s, r) => s + Number(r.budgetedAmount), 0),
            totalActual:   result.reduce((s, r) => s + r.actualAmount, 0),
            overBudget:    result.filter(r => r.status === 'OVER_BUDGET').length,
            onTrack:       result.filter(r => r.status === 'ON_TRACK').length
        };

        return res.json({ status: 200, data: { financialYear: fy, budgets: result, summary } });
    } catch (err) { return res.status(500).json({ status: 500, message: err.message }); }
};

const getBudgets = async (req, res) => {
    try {
        const where = {};
        if (req.query.fy) where.financialYear = req.query.fy;
        const budgets = await db.budget.findAll({ where, order: [['financialYear','DESC'],['month','ASC']] });
        return res.json({ status: 200, data: budgets });
    } catch (err) { return res.status(500).json({ status: 500, message: err.message }); }
};

module.exports = { createBudget, getBudgetVariance, getBudgets };
