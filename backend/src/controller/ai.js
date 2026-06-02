const OpenAI = require('openai');
const db = require('../models');
const moment = require('moment-timezone');
const dailySummaryService = require('../services/dailySummary');

const getClient = () => {
    if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY not set in .env');
    return new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY,
    });
};

const fmt = v => `₹${Number(v || 0).toLocaleString('en-IN')}`;

const gatherContext = async () => {
    const today = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
    const todayDDMMYYYY = moment().tz('Asia/Kolkata').format('DD-MM-YYYY');
    const sevenDaysAgo = moment().tz('Asia/Kolkata').subtract(7, 'days').format('YYYY-MM-DD');
    const thirtyDaysAgo = moment().tz('Asia/Kolkata').subtract(30, 'days').format('YYYY-MM-DD');
    const ninetyDaysAgo = moment().tz('Asia/Kolkata').subtract(90, 'days').format('YYYY-MM-DD');

    const [
        todaySummary,
        recentOrders,
        deletedOrders,
        topCustomers,
        topSuppliers,
        monthlySales,
        overdueCustomers,
        recentPurchases,
        productStock,
        activeLoans,
        recentLoanTx,
        recentPayments,
        recentExpenses,
        expensesByCategory,
        auditLogs,
        billAuditLogs,
        creditNotes,
        debitNotes,
        allCustomersCount,
        allSuppliersCount,
        deletedCustomers,
        deletedSuppliers,
        weeklyExpenseTotal,
    ] = await Promise.allSettled([
        // Today's real-time summary
        dailySummaryService.getRealTimeSummary(today).catch(() => null),

        // Last 15 orders (including paid/unpaid)
        db.order.findAll({
            where: { isDeleted: false },
            order: [['createdAt', 'DESC']],
            limit: 15,
            attributes: ['orderNumber', 'customerName', 'total', 'paymentStatus', 'paymentMode', 'orderDate', 'createdAt'],
            raw: true,
        }).catch(() => []),

        // Recently deleted orders (last 30 days)
        db.sequelize.query(
            `SELECT "orderNumber", "customerName", total, "orderDate", "deletedByName", "deletedAt"
             FROM orders WHERE "isDeleted" = true AND "deletedAt" >= :since
             ORDER BY "deletedAt" DESC LIMIT 10`,
            { replacements: { since: thirtyDaysAgo }, type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // All customers by balance (top 15)
        db.sequelize.query(
            `SELECT name, mobile, "currentBalance", "openingBalance", "isActive"
             FROM customers
             ORDER BY "currentBalance" DESC LIMIT 15`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // All suppliers by balance (top 15)
        db.sequelize.query(
            `SELECT name, mobile, "currentBalance", "openingBalance"
             FROM suppliers
             ORDER BY "currentBalance" DESC LIMIT 15`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Last 30 days sales by day
        db.sequelize.query(
            `SELECT "orderDate", SUM(total::numeric) as sales, COUNT(*) as orders
             FROM orders WHERE "isDeleted" = false AND "createdAt" >= :since
             GROUP BY "orderDate" ORDER BY "orderDate" DESC LIMIT 30`,
            { replacements: { since: thirtyDaysAgo }, type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Overdue customers (unpaid orders)
        db.sequelize.query(
            `SELECT c.name, c.mobile, c."currentBalance",
                    MIN(o."orderDate") as oldest_due,
                    COUNT(o.id) as unpaid_orders
             FROM customers c
             JOIN orders o ON o."customerId" = c.id
             WHERE o."paymentStatus" IN ('unpaid','partial') AND o."isDeleted" = false
               AND c."currentBalance" > 0
             GROUP BY c.id, c.name, c.mobile, c."currentBalance"
             ORDER BY c."currentBalance" DESC LIMIT 15`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Last 10 purchase bills
        db.purchaseBill.findAll({
            order: [['createdAt', 'DESC']],
            limit: 10,
            attributes: ['billNumber', 'supplierName', 'total', 'paymentStatus', 'billDate'],
            raw: true,
        }).catch(() => []),

        // All active products with stock
        db.sequelize.query(
            `SELECT name, "currentStock", "sellingPrice", "costPrice",
                    "stockQuantity", type
             FROM products WHERE "isActive" = true
             ORDER BY "currentStock" ASC NULLS FIRST LIMIT 50`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // All active loans (given and received)
        db.sequelize.query(
            `SELECT "loanNumber", type, "partyName", "partyMobile",
                    "principalAmount", "balanceAmount", "loanDate", status, notes
             FROM loans WHERE "isDeleted" = false
             ORDER BY status ASC, "createdAt" DESC`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Recent loan transactions (last 30 days)
        db.sequelize.query(
            `SELECT t.amount, t."transactionDate", t.notes, t.type as "txType",
                    l.type as "loanType", l."partyName", l."loanNumber"
             FROM loan_transactions t
             INNER JOIN loans l ON l.id = t."loanId"
             ORDER BY t."createdAt" DESC LIMIT 20`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Recent payments (customer receipts + supplier payments, last 30 days)
        db.sequelize.query(
            `SELECT "paymentNumber", "paymentDate", "partyName", "partyType",
                    amount, "referenceType", "referenceNumber", notes
             FROM payments WHERE "isDeleted" = false AND "createdAt" >= :since
             ORDER BY "createdAt" DESC LIMIT 20`,
            { replacements: { since: thirtyDaysAgo }, type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Recent expenses (last 30 days)
        db.sequelize.query(
            `SELECT date, category, description, amount, "paidTo", "paymentMode"
             FROM daily_expenses WHERE "createdAt" >= :since
             ORDER BY date DESC LIMIT 30`,
            { replacements: { since: thirtyDaysAgo }, type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Expenses by category (last 30 days)
        db.sequelize.query(
            `SELECT category, SUM(amount::numeric) as total, COUNT(*) as count
             FROM daily_expenses WHERE "createdAt" >= :since
             GROUP BY category ORDER BY total DESC`,
            { replacements: { since: thirtyDaysAgo }, type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Recent significant audit logs (last 7 days, skip VIEW/LOGIN/LOGOUT)
        db.sequelize.query(
            `SELECT action, "entityType", "entityName", "userName", description, "createdAt"
             FROM audit_logs
             WHERE action NOT IN ('VIEW', 'LOGIN', 'LOGOUT', 'LOGIN_FAILED')
               AND "createdAt" >= :since
             ORDER BY "createdAt" DESC LIMIT 30`,
            { replacements: { since: sevenDaysAgo }, type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Bill audit logs (deletions, item removals) last 30 days
        db.sequelize.query(
            `SELECT "eventType", "userName", "invoiceContext", "customerName",
                    "productName", quantity, "totalPrice", "billTotal", "createdAt"
             FROM bill_audit_logs
             WHERE "createdAt" >= :since
             ORDER BY "createdAt" DESC LIMIT 15`,
            { replacements: { since: thirtyDaysAgo }, type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Recent credit notes
        db.sequelize.query(
            `SELECT "noteNumber", "noteDate", "partyName", total, status, reason
             FROM credit_notes WHERE "isDeleted" = false AND "noteDate" >= :since
             ORDER BY "noteDate" DESC LIMIT 10`,
            { replacements: { since: thirtyDaysAgo }, type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Recent debit notes
        db.sequelize.query(
            `SELECT "noteNumber", "noteDate", "partyName", total, status, reason
             FROM debit_notes WHERE "isDeleted" = false AND "noteDate" >= :since
             ORDER BY "noteDate" DESC LIMIT 10`,
            { replacements: { since: thirtyDaysAgo }, type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Total counts overview
        db.sequelize.query(
            `SELECT
               (SELECT COUNT(*) FROM customers WHERE "isActive" = true) as customers,
               (SELECT COUNT(*) FROM customers WHERE "isActive" = false) as inactive_customers,
               (SELECT COUNT(*) FROM suppliers) as suppliers,
               (SELECT COUNT(*) FROM orders WHERE "isDeleted" = false) as total_orders,
               (SELECT COUNT(*) FROM orders WHERE "isDeleted" = true) as deleted_orders,
               (SELECT SUM(total::numeric) FROM orders WHERE "isDeleted" = false) as lifetime_sales`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => [{}]),

        // Placeholder
        Promise.resolve([]),

        // Inactive customers
        db.sequelize.query(
            `SELECT name, mobile, "currentBalance"
             FROM customers WHERE "isActive" = false
             ORDER BY "currentBalance" DESC LIMIT 10`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Placeholder
        Promise.resolve([]),

        // Weekly expense total
        db.sequelize.query(
            `SELECT SUM(amount::numeric) as total FROM daily_expenses WHERE date >= :since`,
            { replacements: { since: sevenDaysAgo }, type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => [{}]),
    ]);

    const ts = todaySummary.value;
    const todayStr = ts ? [
        `Cash Sales: ${fmt(ts.cashSales)} (${ts.cashOrdersCount} orders)`,
        `Customer Receipts: ${fmt(ts.customerReceipts)}`,
        `Supplier Payments: ${fmt(ts.supplierPayments)}`,
        `Expenses: ${fmt(ts.expenses)}`,
        `Expected Cash in Drawer: ${fmt(ts.cashSales + ts.customerReceipts - ts.supplierPayments - ts.expenses)}`,
        ts.loansCashIn > 0 ? `Loan Repayments Received: ${fmt(ts.loansCashIn)}` : null,
        ts.loansCashOut > 0 ? `Loans Given Out: ${fmt(ts.loansCashOut)}` : null,
    ].filter(Boolean).join('\n') : 'Not available';

    const ordersStr = (recentOrders.value || []).map(o =>
        `${o.orderNumber} | ${o.customerName || 'Walk-in'} | ${fmt(o.total)} | ${o.paymentStatus} | ${o.paymentMode || '-'} | ${o.orderDate}`
    ).join('\n');

    const deletedOrdersStr = (deletedOrders.value || []).map(o =>
        `${o.orderNumber} | ${o.customerName || 'Walk-in'} | ${fmt(o.total)} | deleted by ${o.deletedByName || 'unknown'} on ${o.deletedAt}`
    ).join('\n');

    const customersStr = (topCustomers.value || []).map(c =>
        `${c.name}${c.mobile ? ` (${c.mobile})` : ''}: owes ${fmt(c.currentBalance)}${c.isActive === false ? ' [INACTIVE]' : ''}`
    ).join('\n');

    const suppliersStr = (topSuppliers.value || []).map(s =>
        `${s.name}${s.mobile ? ` (${s.mobile})` : ''}: owed ${fmt(s.currentBalance)}`
    ).join('\n');

    const monthlyStr = (monthlySales.value || []).slice(0, 15).map(r =>
        `${r.orderDate}: ${fmt(r.sales)} (${r.orders} orders)`
    ).join('\n');

    const overdueStr = (overdueCustomers.value || []).map(c =>
        `${c.name}${c.mobile ? ` (${c.mobile})` : ''}: ${fmt(c.currentBalance)} | ${c.unpaid_orders} unpaid orders | oldest due: ${c.oldest_due}`
    ).join('\n');

    const purchasesStr = (recentPurchases.value || []).map(p =>
        `${p.billNumber} | ${p.supplierName} | ${fmt(p.total)} | ${p.paymentStatus} | ${p.billDate}`
    ).join('\n');

    // Stock: split into out-of-stock, low stock, and normal
    const allProducts = productStock.value || [];
    const outOfStock = allProducts.filter(p => Number(p.currentStock) <= 0);
    const lowStock = allProducts.filter(p => Number(p.currentStock) > 0 && Number(p.currentStock) < 10);
    const stockStr = [
        outOfStock.length ? `OUT OF STOCK (${outOfStock.length}): ${outOfStock.map(p => p.name).join(', ')}` : null,
        lowStock.length ? `LOW STOCK (<10 units):\n${lowStock.map(p => `  ${p.name}: ${p.currentStock} units`).join('\n')}` : null,
        `Total active products: ${allProducts.length}`,
    ].filter(Boolean).join('\n');

    // Loans
    const loans = activeLoans.value || [];
    const givenLoans = loans.filter(l => l.type === 'given' && l.status === 'active');
    const receivedLoans = loans.filter(l => l.type === 'received' && l.status === 'active');
    const settledLoans = loans.filter(l => l.status === 'settled');
    const loansStr = [
        givenLoans.length ? `Given (we lent out):\n${givenLoans.map(l => `  ${l.loanNumber} | ${l.partyName}${l.partyMobile ? ` (${l.partyMobile})` : ''} | Principal: ${fmt(l.principalAmount)} | Balance due: ${fmt(l.balanceAmount)} | Date: ${l.loanDate}`).join('\n')}` : '  None',
        receivedLoans.length ? `Received (we borrowed):\n${receivedLoans.map(l => `  ${l.loanNumber} | ${l.partyName} | Principal: ${fmt(l.principalAmount)} | Balance owed: ${fmt(l.balanceAmount)} | Date: ${l.loanDate}`).join('\n')}` : '  None',
        settledLoans.length ? `Settled loans: ${settledLoans.length}` : null,
    ].filter(Boolean).join('\n');

    const loanTxStr = (recentLoanTx.value || []).map(t =>
        `${t.transactionDate} | ${t.partyName} | ${t.loanType === 'given' ? 'Repayment received' : 'Repayment paid'}: ${fmt(t.amount)} | ${t.loanNumber}${t.notes ? ` | ${t.notes}` : ''}`
    ).join('\n');

    const paymentsStr = (recentPayments.value || []).map(p =>
        `${p.paymentDate} | ${p.partyName} (${p.partyType}) | ${fmt(p.amount)} | ref: ${p.referenceNumber || '-'}${p.notes ? ` | ${p.notes}` : ''}`
    ).join('\n');

    const expensesStr = (recentExpenses.value || []).map(e =>
        `${e.date} | ${e.category} | ${fmt(e.amount)}${e.description ? ` | ${e.description}` : ''}${e.paidTo ? ` | paid to: ${e.paidTo}` : ''}`
    ).join('\n');

    const expCatStr = (expensesByCategory.value || []).map(e =>
        `${e.category}: ${fmt(e.total)} (${e.count} entries)`
    ).join('\n');

    const weeklyExp = (weeklyExpenseTotal.value || [{}])[0]?.total || 0;

    const auditStr = (auditLogs.value || []).map(a =>
        `${moment(a.createdAt).tz('Asia/Kolkata').format('DD-MM-YYYY HH:mm')} | ${a.action} | ${a.entityType} | ${a.entityName || '-'} | by ${a.userName || 'system'}${a.description ? ` | ${a.description}` : ''}`
    ).join('\n');

    const billAuditStr = (billAuditLogs.value || []).map(a =>
        `${moment(a.createdAt).tz('Asia/Kolkata').format('DD-MM-YYYY HH:mm')} | ${a.eventType} | ${a.invoiceContext || '-'} | ${a.customerName || '-'} | by ${a.userName || 'unknown'}${a.productName ? ` | item: ${a.productName} x${a.quantity} = ${fmt(a.totalPrice)}` : ''}${a.billTotal ? ` | bill total: ${fmt(a.billTotal)}` : ''}`
    ).join('\n');

    const creditStr = (creditNotes.value || []).map(n =>
        `${n.noteNumber} | ${n.noteDate} | ${n.partyName} | ${fmt(n.total)} | ${n.status}${n.reason ? ` | ${n.reason}` : ''}`
    ).join('\n');

    const debitStr = (debitNotes.value || []).map(n =>
        `${n.noteNumber} | ${n.noteDate} | ${n.partyName} | ${fmt(n.total)} | ${n.status}${n.reason ? ` | ${n.reason}` : ''}`
    ).join('\n');

    const counts = (allCustomersCount.value || [{}])[0] || {};


    const delCustStr = (deletedCustomers.value || []).map(c =>
        `${c.name}${c.mobile ? ` (${c.mobile})` : ''} | balance: ${fmt(c.currentBalance)} [INACTIVE]`
    ).join('\n');

    // deletedSuppliers slot is unused placeholder

    return `=== TODAY (${todayDDMMYYYY}) ===
${todayStr}

=== BUSINESS OVERVIEW ===
Active customers: ${counts.customers || 0} | Inactive customers: ${counts.inactive_customers || 0}
Total suppliers: ${counts.suppliers || 0}
Total invoices: ${counts.total_orders || 0} | Deleted invoices: ${counts.deleted_orders || 0}
Lifetime sales: ${fmt(counts.lifetime_sales)}

=== RECENT 15 ORDERS ===
${ordersStr || 'None'}

=== RECENTLY DELETED ORDERS (last 30 days) ===
${deletedOrdersStr || 'None'}

=== CUSTOMERS (by outstanding balance) ===
${customersStr || 'None'}

=== OVERDUE CUSTOMERS (unpaid orders) ===
${overdueStr || 'None'}

=== INACTIVE CUSTOMERS ===
${delCustStr || 'None'}

=== SUPPLIERS (by owed amount) ===
${suppliersStr || 'None'}

=== RECENT PURCHASES ===
${purchasesStr || 'None'}

=== LAST 15 DAYS SALES ===
${monthlyStr || 'None'}

=== LOANS ===
${loansStr}

=== RECENT LOAN TRANSACTIONS ===
${loanTxStr || 'None'}

=== RECENT PAYMENTS (last 30 days) ===
${paymentsStr || 'None'}

=== EXPENSES (last 30 days) ===
This week total: ${fmt(weeklyExp)}
By category:
${expCatStr || 'None'}
Recent entries:
${expensesStr || 'None'}

=== INVENTORY ===
${stockStr}

=== CREDIT NOTES (last 30 days) ===
${creditStr || 'None'}

=== DEBIT NOTES (last 30 days) ===
${debitStr || 'None'}

=== RECENT ACTIVITY LOG (last 7 days) ===
${auditStr || 'None'}

=== BILL AUDIT LOG (deletions/modifications, last 30 days) ===
${billAuditStr || 'None'}`;
};

module.exports = {
    chat: async (req, res) => {
        try {
            const { message, history = [] } = req.body;
            if (!message?.trim()) {
                return res.status(400).json({ status: 400, message: 'message is required' });
            }

            const client = getClient();
            const context = await gatherContext();

            const systemPrompt = `You are a smart business assistant for RS Invoice, an invoicing and billing software used by an Indian retail shop.

You have access to the following COMPLETE real-time business data:

${context}

Guidelines:
- Answer in the same language the user writes (Hindi or English). Mix is fine.
- Format monetary values with ₹ symbol in Indian format (use lakh/crore for large numbers).
- Be concise and direct — shopkeeper is busy.
- If a customer/supplier name is mentioned, look them up in the data above.
- If data isn't available for a question, say so honestly.
- For deleted records, be clear that they were deleted and by whom.
- For audit logs, summarize what changed rather than listing raw entries.
- Today's date: ${moment().tz('Asia/Kolkata').format('DD MMM YYYY, dddd')}`;

            const messages = [
                { role: 'system', content: systemPrompt },
                ...history.slice(-6),
                { role: 'user', content: message.trim() },
            ];

            const completion = await client.chat.completions.create({
                model: 'deepseek-chat',
                messages,
                max_tokens: 1024,
                temperature: 0.3,
            });

            const reply = completion.choices[0]?.message?.content || 'Sorry, no response received.';

            return res.json({
                status: 200,
                data: {
                    reply,
                    usage: completion.usage,
                }
            });

        } catch (err) {
            console.error('[AI chat error]', err.message);
            const msg = err.message?.includes('DEEPSEEK_API_KEY')
                ? 'DeepSeek API key not configured. Add DEEPSEEK_API_KEY to backend/.env'
                : err.message?.includes('401') || err.message?.includes('Incorrect API key')
                ? 'Invalid DeepSeek API key. Check DEEPSEEK_API_KEY in backend/.env'
                : 'AI service error: ' + err.message;
            return res.status(500).json({ status: 500, message: msg });
        }
    }
};
