/**
 * Financial Reports Controller
 * Tally-equivalent: Trial Balance, P&L, Balance Sheet, Cash Flow, Daybook
 */
const db = require('../models');
const moment = require('moment');

// ─── helpers ────────────────────────────────────────────────────────────────

function currentFinancialYear() {
    const now = moment();
    const month = now.month() + 1; // 1-based
    const year = now.year();
    const fyStart = month >= 4 ? year : year - 1;
    return { start: `${fyStart}-04-01`, end: `${fyStart + 1}-03-31`, label: `${fyStart}-${fyStart + 1}` };
}

function parseDateRange(req) {
    const fy = currentFinancialYear();
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

    const fromRaw = req.query.from || fy.start;
    const toRaw   = req.query.to   || fy.end;

    if (!ISO_DATE.test(fromRaw) || !ISO_DATE.test(toRaw)) {
        throw Object.assign(new Error('Date parameters must be in YYYY-MM-DD format'), { statusCode: 400 });
    }

    const from = fromRaw;
    const to   = toRaw;

    if (from > to) {
        throw Object.assign(new Error('"from" date must not be after "to" date'), { statusCode: 400 });
    }

    return { from, to };
}

// ─── TRIAL BALANCE ───────────────────────────────────────────────────────────

const getTrialBalance = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req);

        const [rows] = await db.sequelize.query(`
            SELECT
                a.id,
                a.code,
                a.name,
                a.type,
                a."subType",
                COALESCE(SUM(CASE WHEN jb."transactionDate" < :from THEN le.debit  ELSE 0 END), 0) AS opening_dr,
                COALESCE(SUM(CASE WHEN jb."transactionDate" < :from THEN le.credit ELSE 0 END), 0) AS opening_cr,
                COALESCE(SUM(CASE WHEN jb."transactionDate" BETWEEN :from AND :to THEN le.debit  ELSE 0 END), 0) AS period_dr,
                COALESCE(SUM(CASE WHEN jb."transactionDate" BETWEEN :from AND :to THEN le.credit ELSE 0 END), 0) AS period_cr,
                COALESCE(SUM(le.debit),  0) AS total_dr,
                COALESCE(SUM(le.credit), 0) AS total_cr
            FROM accounts a
            INNER JOIN ledger_entries le ON le."accountId" = a.id
            INNER JOIN journal_batches jb ON le."batchId" = jb.id
            WHERE jb."isPosted" = true
              AND jb."isReversed" = false
              AND a."isActive" = true
              AND jb."transactionDate" <= :to
            GROUP BY a.id, a.code, a.name, a.type, a."subType"
            ORDER BY a.code
        `, { replacements: { from, to } });

        const accounts = rows.map(r => {
            const openingBalance = Number(r.opening_dr) - Number(r.opening_cr);
            const periodDr = Number(r.period_dr);
            const periodCr = Number(r.period_cr);
            let closingDr = 0, closingCr = 0;
            const closing = openingBalance + periodDr - periodCr;
            if (closing >= 0) closingDr = closing; else closingCr = -closing;
            return {
                id: r.id, code: r.code, name: r.name, type: r.type, subType: r.subType,
                openingBalance,
                periodDebit: periodDr, periodCredit: periodCr,
                closingDebit: closingDr, closingCredit: closingCr
            };
        });

        const totals = accounts.reduce((acc, a) => ({
            openingDr: acc.openingDr + (a.openingBalance > 0 ? a.openingBalance : 0),
            openingCr: acc.openingCr + (a.openingBalance < 0 ? -a.openingBalance : 0),
            periodDr:  acc.periodDr  + a.periodDebit,
            periodCr:  acc.periodCr  + a.periodCredit,
            closingDr: acc.closingDr + a.closingDebit,
            closingCr: acc.closingCr + a.closingCredit
        }), { openingDr:0, openingCr:0, periodDr:0, periodCr:0, closingDr:0, closingCr:0 });

        return res.json({ status: 200, data: { period: { from, to }, accounts, totals } });
    } catch (err) {
        console.error('Trial balance error:', err);
        const sc = err.statusCode || 500;
        return res.status(sc).json({ status: sc, message: err.message });
    }
};

// ─── PROFIT & LOSS ───────────────────────────────────────────────────────────

const getProfitAndLoss = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req);

        const [rows] = await db.sequelize.query(`
            SELECT
                a.id, a.code, a.name, a.type, a."subType",
                a."parentId",
                COALESCE(SUM(le.debit),  0) AS total_dr,
                COALESCE(SUM(le.credit), 0) AS total_cr
            FROM accounts a
            INNER JOIN ledger_entries le ON le."accountId" = a.id
            INNER JOIN journal_batches jb ON le."batchId" = jb.id
            WHERE jb."isPosted" = true
              AND jb."isReversed" = false
              AND a.type IN ('INCOME','EXPENSE')
              AND jb."transactionDate" BETWEEN :from AND :to
            GROUP BY a.id, a.code, a.name, a.type, a."subType", a."parentId"
            ORDER BY a.type DESC, a.code
        `, { replacements: { from, to } });

        const income  = [];
        const expense = [];
        let totalIncome = 0, totalExpense = 0;

        rows.forEach(r => {
            // INCOME: credit > debit = net income
            // EXPENSE: debit > credit = net expense
            const net = Number(r.total_cr) - Number(r.total_dr);
            if (r.type === 'INCOME') {
                income.push({ id: r.id, code: r.code, name: r.name, subType: r.subType, amount: net });
                totalIncome += net;
            } else {
                const expAmt = Number(r.total_dr) - Number(r.total_cr);
                expense.push({ id: r.id, code: r.code, name: r.name, subType: r.subType, amount: expAmt });
                totalExpense += expAmt;
            }
        });

        const grossProfit = income.filter(i => i.subType === 'SALES' || i.code?.startsWith('4'))
            .reduce((s, i) => s + i.amount, 0)
            - expense.filter(e => e.subType === 'COGS' || e.code?.startsWith('5'))
            .reduce((s, e) => s + e.amount, 0);

        const netProfit = totalIncome - totalExpense;

        return res.json({
            status: 200,
            data: {
                period: { from, to },
                income,  totalIncome,
                expense, totalExpense,
                grossProfit,
                netProfit,
                netProfitPercent: totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(2) : 0
            }
        });
    } catch (err) {
        console.error('P&L error:', err);
        const sc = err.statusCode || 500;
        return res.status(sc).json({ status: sc, message: err.message });
    }
};

// ─── BALANCE SHEET ───────────────────────────────────────────────────────────

const getBalanceSheet = async (req, res) => {
    try {
        const asOf = req.query.asOf || moment().format('YYYY-MM-DD');

        const [rows] = await db.sequelize.query(`
            SELECT
                a.id, a.code, a.name, a.type, a."subType", a."parentId",
                COALESCE(SUM(le.debit),  0) AS total_dr,
                COALESCE(SUM(le.credit), 0) AS total_cr
            FROM accounts a
            INNER JOIN ledger_entries le ON le."accountId" = a.id
            INNER JOIN journal_batches jb ON le."batchId" = jb.id
            WHERE jb."isPosted" = true
              AND jb."isReversed" = false
              AND jb."transactionDate" <= :asOf
            GROUP BY a.id, a.code, a.name, a.type, a."subType", a."parentId"
            ORDER BY a.type, a.code
        `, { replacements: { asOf } });

        const assets      = { current: [], fixed: [], other: [], total: 0 };
        const liabilities = { current: [], longTerm: [], other: [], total: 0 };
        const equity      = { items: [], total: 0 };

        rows.forEach(r => {
            const balance = Number(r.total_dr) - Number(r.total_cr);

            if (r.type === 'ASSET') {
                const entry = { id: r.id, code: r.code, name: r.name, subType: r.subType, balance };
                if (r.subType === 'FIXED') assets.fixed.push(entry);
                else assets.current.push(entry);
                assets.total += balance;

            } else if (r.type === 'LIABILITY') {
                const balance2 = Number(r.total_cr) - Number(r.total_dr);
                const entry = { id: r.id, code: r.code, name: r.name, subType: r.subType, balance: balance2 };
                if (r.subType === 'LONG_TERM') liabilities.longTerm.push(entry);
                else liabilities.current.push(entry);
                liabilities.total += balance2;

            } else if (r.type === 'EQUITY') {
                const balance2 = Number(r.total_cr) - Number(r.total_dr);
                equity.items.push({ id: r.id, code: r.code, name: r.name, balance: balance2 });
                equity.total += balance2;

            } else if (r.type === 'INCOME') {
                // Net P&L flows into retained earnings
                const netIncome = Number(r.total_cr) - Number(r.total_dr);
                equity.total += netIncome;

            } else if (r.type === 'EXPENSE') {
                const netExpense = Number(r.total_dr) - Number(r.total_cr);
                equity.total -= netExpense;
            }
        });

        const totalLiabEquity = liabilities.total + equity.total;

        return res.json({
            status: 200,
            data: {
                asOf,
                assets, liabilities, equity,
                totalAssets: assets.total,
                totalLiabilitiesEquity: totalLiabEquity,
                balanced: Math.abs(assets.total - totalLiabEquity) < 0.01
            }
        });
    } catch (err) {
        console.error('Balance sheet error:', err);
        const sc = err.statusCode || 500;
        return res.status(sc).json({ status: sc, message: err.message });
    }
};

// ─── DAYBOOK ─────────────────────────────────────────────────────────────────

const getDaybook = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req);
        const page  = parseInt(req.query.page  || 1);
        const limit = parseInt(req.query.limit || 100);
        const offset = (page - 1) * limit;

        const [batches] = await db.sequelize.query(`
            SELECT
                jb.id, jb."batchNumber", jb."referenceType", jb."referenceId",
                jb.description, jb."transactionDate",
                jb."totalDebit", jb."totalCredit",
                jb."isReversed",
                COUNT(*) OVER() AS total_count
            FROM journal_batches jb
            WHERE jb."isPosted" = true
              AND jb."transactionDate" BETWEEN :from AND :to
            ORDER BY jb."transactionDate" DESC, jb."createdAt" DESC
            LIMIT :limit OFFSET :offset
        `, { replacements: { from, to, limit, offset } });

        const batchIds = batches.map(b => b.id);
        let entries = [];
        if (batchIds.length > 0) {
            const [rows] = await db.sequelize.query(`
                SELECT le.*, a.name AS accountName, a.code AS accountCode, le."batchId"
                FROM ledger_entries le
                INNER JOIN accounts a ON a.id = le."accountId"
                WHERE le."batchId" IN (:batchIds)
                ORDER BY le."batchId", le.debit DESC
            `, { replacements: { batchIds } });
            entries = rows;
        }

        const batchMap = {};
        entries.forEach(e => {
            if (!batchMap[e.batchId]) batchMap[e.batchId] = [];
            batchMap[e.batchId].push(e);
        });

        const result = batches.map(b => ({
            ...b,
            lines: batchMap[b.id] || []
        }));

        const totalCount = batches[0]?.total_count || 0;

        return res.json({
            status: 200,
            data: {
                period: { from, to },
                vouchers: result,
                pagination: { page, limit, total: parseInt(totalCount), pages: Math.ceil(totalCount / limit) }
            }
        });
    } catch (err) {
        console.error('Daybook error:', err);
        const sc = err.statusCode || 500;
        return res.status(sc).json({ status: sc, message: err.message });
    }
};

// ─── CASH BOOK ───────────────────────────────────────────────────────────────

const getCashBook = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req);

        // Get cash account (1100)
        const cashAccount = await db.account.findOne({ where: { code: '1100' } });
        if (!cashAccount) return res.status(404).json({ status: 404, message: 'Cash account (1100) not found' });

        const [rows] = await db.sequelize.query(`
            SELECT
                jb."transactionDate" AS txn_date,
                jb."batchNumber",
                jb."referenceType",
                jb.description,
                le.debit,
                le.credit,
                le.narration,
                COALESCE(SUM(le.debit - le.credit) OVER (ORDER BY jb."transactionDate", jb."createdAt"), 0) AS running_balance
            FROM ledger_entries le
            INNER JOIN journal_batches jb ON le."batchId" = jb.id
            WHERE le."accountId" = :accountId
              AND jb."isPosted" = true
              AND jb."isReversed" = false
              AND jb."transactionDate" BETWEEN :from AND :to
            ORDER BY jb."transactionDate", jb."createdAt"
        `, { replacements: { accountId: cashAccount.id, from, to } });

        const totalReceipts = rows.reduce((s, r) => s + Number(r.debit),  0);
        const totalPayments = rows.reduce((s, r) => s + Number(r.credit), 0);

        return res.json({
            status: 200,
            data: {
                period: { from, to },
                account: { id: cashAccount.id, name: cashAccount.name, code: cashAccount.code },
                entries: rows,
                totalReceipts,
                totalPayments,
                netBalance: totalReceipts - totalPayments
            }
        });
    } catch (err) {
        console.error('Cash book error:', err);
        const sc = err.statusCode || 500;
        return res.status(sc).json({ status: sc, message: err.message });
    }
};

// ─── LEDGER ACCOUNT STATEMENT ────────────────────────────────────────────────

const getLedgerStatement = async (req, res) => {
    try {
        const { accountId } = req.params;
        const { from, to } = parseDateRange(req);

        const account = await db.account.findByPk(accountId);
        if (!account) return res.status(404).json({ status: 404, message: 'Account not found' });

        const [rows] = await db.sequelize.query(`
            SELECT
                jb."transactionDate", jb."batchNumber", jb."referenceType",
                jb.description, le.debit, le.credit, le.narration,
                SUM(le.debit - le.credit) OVER (ORDER BY jb."transactionDate", jb."createdAt" ROWS UNBOUNDED PRECEDING) AS running_balance
            FROM ledger_entries le
            INNER JOIN journal_batches jb ON le."batchId" = jb.id
            WHERE le."accountId" = :accountId
              AND jb."isPosted" = true
              AND jb."isReversed" = false
              AND jb."transactionDate" BETWEEN :from AND :to
            ORDER BY jb."transactionDate", jb."createdAt"
        `, { replacements: { accountId, from, to } });

        return res.json({
            status: 200,
            data: {
                account: { id: account.id, code: account.code, name: account.name, type: account.type },
                period: { from, to },
                entries: rows,
                totals: {
                    debit:  rows.reduce((s, r) => s + Number(r.debit),  0),
                    credit: rows.reduce((s, r) => s + Number(r.credit), 0)
                }
            }
        });
    } catch (err) {
        console.error('Ledger statement error:', err);
        const sc = err.statusCode || 500;
        return res.status(sc).json({ status: sc, message: err.message });
    }
};

// ─── RECEIVABLES AGEING ──────────────────────────────────────────────────────

const getReceivablesAgeing = async (req, res) => {
    try {
        const asOf = req.query.asOf || moment().format('YYYY-MM-DD');

        const [rows] = await db.sequelize.query(`
            SELECT
                o.id,
                o."orderNumber",
                o."orderDate",
                o."dueDate",
                o."customerName",
                o."customerId",
                o.total,
                o."paidAmount",
                o."dueAmount",
                o."paymentStatus",
                CASE
                    WHEN o."dueDate" IS NOT NULL
                    THEN :asOf::date - o."dueDate"::date
                    ELSE :asOf::date - CASE
                        WHEN o."orderDate" ~ '^\d{2}-\d{2}-\d{4}$'
                        THEN TO_DATE(o."orderDate", 'DD-MM-YYYY')
                        ELSE o."orderDate"::date
                    END
                END AS days_overdue
            FROM orders o
            WHERE o."isDeleted" = false
              AND o."dueAmount" > 0.01
              AND CASE
                    WHEN o."orderDate" ~ '^\d{2}-\d{2}-\d{4}$'
                    THEN TO_DATE(o."orderDate", 'DD-MM-YYYY')
                    ELSE o."orderDate"::date
                  END <= :asOf::date
            ORDER BY days_overdue DESC
        `, { replacements: { asOf } });

        const buckets = {
            current:     { label: 'Current (0 days)',  rows: [], total: 0 },
            days0_30:    { label: '1-30 days',          rows: [], total: 0 },
            days31_60:   { label: '31-60 days',         rows: [], total: 0 },
            days61_90:   { label: '61-90 days',         rows: [], total: 0 },
            days91_180:  { label: '91-180 days',        rows: [], total: 0 },
            above180:    { label: 'Above 180 days',     rows: [], total: 0 }
        };

        rows.forEach(r => {
            const due = Number(r.dueAmount);
            const days = Number(r.days_overdue);
            const entry = { ...r, dueAmount: due, days_overdue: days };

            if (days <= 0)        { buckets.current.rows.push(entry);    buckets.current.total    += due; }
            else if (days <= 30)  { buckets.days0_30.rows.push(entry);   buckets.days0_30.total   += due; }
            else if (days <= 60)  { buckets.days31_60.rows.push(entry);  buckets.days31_60.total  += due; }
            else if (days <= 90)  { buckets.days61_90.rows.push(entry);  buckets.days61_90.total  += due; }
            else if (days <= 180) { buckets.days91_180.rows.push(entry); buckets.days91_180.total += due; }
            else                  { buckets.above180.rows.push(entry);   buckets.above180.total   += due; }
        });

        const grandTotal = Object.values(buckets).reduce((s, b) => s + b.total, 0);

        return res.json({
            status: 200,
            data: { asOf, buckets, grandTotal, totalInvoices: rows.length }
        });
    } catch (err) {
        console.error('Receivables ageing error:', err);
        const sc = err.statusCode || 500;
        return res.status(sc).json({ status: sc, message: err.message });
    }
};

// ─── PAYABLES AGEING ─────────────────────────────────────────────────────────

const getPayablesAgeing = async (req, res) => {
    try {
        const asOf = req.query.asOf || moment().format('YYYY-MM-DD');

        const [rows] = await db.sequelize.query(`
            SELECT
                pb.id, pb."billNumber", pb."billDate", pb."dueDate",
                s.name AS supplierName, pb."supplierId",
                pb.total, pb."paidAmount", pb."dueAmount", pb."paymentStatus",
                CASE
                    WHEN pb."dueDate" IS NOT NULL
                    THEN :asOf::date - pb."dueDate"::date
                    ELSE :asOf::date - CASE
                        WHEN pb."billDate" ~ '^\d{2}-\d{2}-\d{4}$'
                        THEN TO_DATE(pb."billDate", 'DD-MM-YYYY')
                        ELSE pb."billDate"::date
                    END
                END AS days_overdue
            FROM purchase_bills pb
            LEFT JOIN suppliers s ON s.id = pb."supplierId"
            WHERE pb."isDeleted" = false
              AND pb."dueAmount" > 0.01
              AND CASE
                    WHEN pb."billDate" ~ '^\d{2}-\d{2}-\d{4}$'
                    THEN TO_DATE(pb."billDate", 'DD-MM-YYYY')
                    ELSE pb."billDate"::date
                  END <= :asOf::date
            ORDER BY days_overdue DESC
        `, { replacements: { asOf } });

        const buckets = {
            current:    { label: 'Current',        rows: [], total: 0 },
            days0_30:   { label: '1-30 days',       rows: [], total: 0 },
            days31_60:  { label: '31-60 days',      rows: [], total: 0 },
            days61_90:  { label: '61-90 days',      rows: [], total: 0 },
            days91_180: { label: '91-180 days',     rows: [], total: 0 },
            above180:   { label: 'Above 180 days',  rows: [], total: 0 }
        };

        rows.forEach(r => {
            const due  = Number(r.dueAmount);
            const days = Number(r.days_overdue);
            const entry = { ...r, dueAmount: due, days_overdue: days };
            if (days <= 0)        { buckets.current.rows.push(entry);    buckets.current.total    += due; }
            else if (days <= 30)  { buckets.days0_30.rows.push(entry);   buckets.days0_30.total   += due; }
            else if (days <= 60)  { buckets.days31_60.rows.push(entry);  buckets.days31_60.total  += due; }
            else if (days <= 90)  { buckets.days61_90.rows.push(entry);  buckets.days61_90.total  += due; }
            else if (days <= 180) { buckets.days91_180.rows.push(entry); buckets.days91_180.total += due; }
            else                  { buckets.above180.rows.push(entry);   buckets.above180.total   += due; }
        });

        const grandTotal = Object.values(buckets).reduce((s, b) => s + b.total, 0);

        return res.json({
            status: 200,
            data: { asOf, buckets, grandTotal, totalBills: rows.length }
        });
    } catch (err) {
        console.error('Payables ageing error:', err);
        const sc = err.statusCode || 500;
        return res.status(sc).json({ status: sc, message: err.message });
    }
};

// ─── STOCK SUMMARY ───────────────────────────────────────────────────────────

const getStockSummary = async (req, res) => {
    try {
        const [rows] = await db.sequelize.query(`
            SELECT
                p.id, p.name, p.type, p."pricePerKg",
                p."hsnCode", p.unit,
                COALESCE(s."currentStock", 0)                                        AS "currentStock",
                COALESCE(s."minStockLevel", 0)                                       AS "minStockLevel",
                COALESCE(s."currentStock", 0) * COALESCE(p."pricePerKg", 0)         AS "stockValue",
                CASE WHEN COALESCE(s."currentStock", 0) <= COALESCE(s."minStockLevel", 0)
                     THEN true ELSE false END                                        AS "belowReorder"
            FROM products p
            LEFT JOIN stocks s ON s."productId" = p.id
            WHERE COALESCE(p."isActive", true) = true
            ORDER BY p.name
        `);

        const totalValue = rows.reduce((s, r) => s + Number(r.stockValue || 0), 0);
        const belowReorder = rows.filter(r => r.belowReorder);

        return res.json({
            status: 200,
            data: { items: rows, totalValue, belowReorderCount: belowReorder.length, belowReorder }
        });
    } catch (err) {
        console.error('Stock summary error:', err);
        const sc = err.statusCode || 500;
        return res.status(sc).json({ status: sc, message: err.message });
    }
};

// ─── SALES REGISTER ──────────────────────────────────────────────────────────

const getSalesRegister = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req);

        const [rows] = await db.sequelize.query(`
            SELECT
                o.id, o."orderNumber", o."orderDate", o."customerName",
                o."customerId", o."placeOfSupply", o."supplyType",
                o."subTotal", o."cgst", o."sgst", o."igst", o."cess",
                o.tax, o.total, o."paidAmount", o."dueAmount",
                o."paymentStatus", o."paymentMode",
                o."reverseCharge", o."customerGstin"
            FROM orders o
            WHERE o."isDeleted" = false
              AND CASE WHEN o."orderDate" ~ '^\d{2}-\d{2}-\d{4}$'
                       THEN TO_DATE(o."orderDate", 'DD-MM-YYYY')
                       ELSE o."orderDate"::date END >= :from::date
              AND CASE WHEN o."orderDate" ~ '^\d{2}-\d{2}-\d{4}$'
                       THEN TO_DATE(o."orderDate", 'DD-MM-YYYY')
                       ELSE o."orderDate"::date END <= :to::date
            ORDER BY o."orderDate", o."orderNumber"
        `, { replacements: { from, to } });

        const summary = rows.reduce((acc, r) => ({
            taxableValue: acc.taxableValue + Number(r.subTotal || 0),
            cgst:  acc.cgst  + Number(r.cgst  || 0),
            sgst:  acc.sgst  + Number(r.sgst  || 0),
            igst:  acc.igst  + Number(r.igst  || 0),
            cess:  acc.cess  + Number(r.cess  || 0),
            total: acc.total + Number(r.total  || 0)
        }), { taxableValue:0, cgst:0, sgst:0, igst:0, cess:0, total:0 });

        return res.json({
            status: 200,
            data: { period: { from, to }, invoices: rows, summary, count: rows.length }
        });
    } catch (err) {
        console.error('Sales register error:', err);
        const sc = err.statusCode || 500;
        return res.status(sc).json({ status: sc, message: err.message });
    }
};

// ─── PURCHASE REGISTER ───────────────────────────────────────────────────────

const getPurchaseRegister = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req);

        const [rows] = await db.sequelize.query(`
            SELECT
                pb.id, pb."billNumber", pb."billDate",
                s.name AS supplierName, pb."supplierId",
                pb."supplierGstin", pb."placeOfSupply", pb."supplyType",
                pb."subTotal", pb."cgst", pb."sgst", pb."igst", pb."cess",
                pb.tax, pb.total, pb."paidAmount", pb."dueAmount",
                pb."paymentStatus", pb."reverseCharge"
            FROM purchase_bills pb
            LEFT JOIN suppliers s ON s.id = pb."supplierId"
            WHERE pb."isDeleted" = false
              AND CASE WHEN pb."billDate" ~ '^\d{2}-\d{2}-\d{4}$'
                       THEN TO_DATE(pb."billDate", 'DD-MM-YYYY')
                       ELSE pb."billDate"::date END >= :from::date
              AND CASE WHEN pb."billDate" ~ '^\d{2}-\d{2}-\d{4}$'
                       THEN TO_DATE(pb."billDate", 'DD-MM-YYYY')
                       ELSE pb."billDate"::date END <= :to::date
            ORDER BY pb."billDate", pb."billNumber"
        `, { replacements: { from, to } });

        const summary = rows.reduce((acc, r) => ({
            taxableValue: acc.taxableValue + Number(r.subTotal || 0),
            cgst:  acc.cgst  + Number(r.cgst  || 0),
            sgst:  acc.sgst  + Number(r.sgst  || 0),
            igst:  acc.igst  + Number(r.igst  || 0),
            total: acc.total + Number(r.total  || 0)
        }), { taxableValue:0, cgst:0, sgst:0, igst:0, total:0 });

        return res.json({
            status: 200,
            data: { period: { from, to }, bills: rows, summary, count: rows.length }
        });
    } catch (err) {
        console.error('Purchase register error:', err);
        const sc = err.statusCode || 500;
        return res.status(sc).json({ status: sc, message: err.message });
    }
};

// ─── RATIO ANALYSIS ──────────────────────────────────────────────────────────

const getRatioAnalysis = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req);
        const asOf = req.query.asOf || to;

        // Get totals by account type
        const [balSheet] = await db.sequelize.query(`
            SELECT a.type, a."subType",
                   COALESCE(SUM(le.debit),  0) AS total_dr,
                   COALESCE(SUM(le.credit), 0) AS total_cr
            FROM accounts a
            INNER JOIN ledger_entries le ON le."accountId" = a.id
            INNER JOIN journal_batches jb ON le."batchId" = jb.id
            WHERE jb."isPosted" = true AND jb."isReversed" = false
              AND jb."transactionDate" <= :asOf
            GROUP BY a.type, a."subType"
        `, { replacements: { asOf } });

        // HIGH-07: fetch P&L with subType so we can separate sales revenue from COGS.
        // Gross Margin = (Sales Revenue - COGS) / Sales Revenue × 100
        // Net Profit Margin = Net Profit / Total Revenue × 100  (different denominators)
        const [pl] = await db.sequelize.query(`
            SELECT a.type, a."subType",
                   COALESCE(SUM(le.debit),  0) AS total_dr,
                   COALESCE(SUM(le.credit), 0) AS total_cr
            FROM accounts a
            INNER JOIN ledger_entries le ON le."accountId" = a.id
            INNER JOIN journal_batches jb ON le."batchId" = jb.id
            WHERE jb."isPosted" = true AND jb."isReversed" = false
              AND a.type IN ('INCOME','EXPENSE')
              AND jb."transactionDate" BETWEEN :from AND :to
            GROUP BY a.type, a."subType"
        `, { replacements: { from, to } });

        const get = (type, subType, side) => {
            const row = balSheet.find(r => r.type === type && (!subType || r.subType === subType));
            if (!row) return 0;
            return side === 'dr' ? Number(row.total_dr) : Number(row.total_cr);
        };
        const getPL = (type, subType = null) => {
            const rows = pl.filter(r => r.type === type && (!subType || r.subType === subType));
            return rows.reduce((sum, r) => {
                return sum + (type === 'INCOME'
                    ? Number(r.total_cr) - Number(r.total_dr)
                    : Number(r.total_dr) - Number(r.total_cr));
            }, 0);
        };

        const currentAssets      = get('ASSET', 'CURRENT', 'dr') - get('ASSET', 'CURRENT', 'cr');
        const currentLiabilities = get('LIABILITY', 'CURRENT', 'cr') - get('LIABILITY', 'CURRENT', 'dr');
        const totalRevenue        = getPL('INCOME');
        const totalExpenses       = getPL('EXPENSE');
        const netProfit           = totalRevenue - totalExpenses;
        // salesRevenue = SALES sub-type income (or fall back to all income if no sub-type set)
        const salesRevenue        = getPL('INCOME', 'SALES') || totalRevenue;
        const cogsExpense         = getPL('EXPENSE', 'COGS');
        const grossProfit         = salesRevenue - cogsExpense;

        // HIGH-07: grossMargin denominator must be salesRevenue (the revenue base that
        // corresponds to COGS), not totalRevenue which may include non-trading income.
        // Standard formula: Gross Margin % = (Gross Profit / Net Sales Revenue) × 100
        // Net Profit Margin % = (Net Profit / Total Revenue) × 100  ← totalRevenue is correct here
        const ratios = {
            currentRatio:   currentLiabilities > 0 ? (currentAssets / currentLiabilities).toFixed(2) : 'N/A',
            // HIGH-07: grossMargin uses salesRevenue denominator, NOT totalRevenue
            grossMargin:    salesRevenue > 0 ? ((grossProfit / salesRevenue) * 100).toFixed(2) + '%' : 'N/A',
            netProfitMargin:totalRevenue > 0 ? ((netProfit  / totalRevenue) * 100).toFixed(2) + '%' : 'N/A',
            revenueGrowth:  'N/A' // requires prior period comparison
        };

        return res.json({ status: 200, data: { period: { from, to, asOf }, ratios, summary: { currentAssets, currentLiabilities, totalRevenue, totalExpenses, netProfit } } });
    } catch (err) {
        console.error('Ratio analysis error:', err);
        const sc = err.statusCode || 500;
        return res.status(sc).json({ status: sc, message: err.message });
    }
};

module.exports = {
    getTrialBalance, getProfitAndLoss, getBalanceSheet,
    getDaybook, getCashBook, getLedgerStatement,
    getReceivablesAgeing, getPayablesAgeing,
    getStockSummary, getSalesRegister, getPurchaseRegister,
    getRatioAnalysis
};
