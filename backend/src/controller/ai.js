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

// Gather relevant business data to give DeepSeek context
const gatherContext = async () => {
    const today = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
    const todayDDMMYYYY = moment().tz('Asia/Kolkata').format('DD-MM-YYYY');
    const thirtyDaysAgo = moment().tz('Asia/Kolkata').subtract(30, 'days').format('YYYY-MM-DD');

    // Run all queries in parallel
    const [
        todaySummary,
        recentOrders,
        topCustomers,
        topSuppliers,
        monthlySales,
        overdueCustomers,
        recentPurchases,
        productCount,
    ] = await Promise.allSettled([
        // Today's real-time summary
        dailySummaryService.getRealTimeSummary(today).catch(() => null),

        // Last 10 orders
        db.order.findAll({
            where: { isDeleted: false },
            order: [['createdAt', 'DESC']],
            limit: 10,
            attributes: ['orderNumber', 'customerName', 'total', 'paymentStatus', 'paymentMode', 'orderDate'],
            raw: true,
        }).catch(() => []),

        // Top 10 customers by balance (most due)
        db.sequelize.query(
            `SELECT name, mobile, "currentBalance" FROM customers ORDER BY "currentBalance" DESC LIMIT 10`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Top 10 suppliers by balance (most owed)
        db.sequelize.query(
            `SELECT name, mobile, "currentBalance" FROM suppliers ORDER BY "currentBalance" DESC LIMIT 10`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Last 30 days sales by day
        db.sequelize.query(
            `SELECT "orderDate", SUM(total::numeric) as sales, COUNT(*) as orders
             FROM orders WHERE "isDeleted" = false AND "createdAt" >= :since
             GROUP BY "orderDate" ORDER BY "orderDate" DESC LIMIT 30`,
            { replacements: { since: thirtyDaysAgo }, type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Overdue customers (due > 30 days)
        db.sequelize.query(
            `SELECT c.name, c.mobile, c."currentBalance",
                    MIN(o."orderDate") as oldest_due
             FROM customers c
             JOIN orders o ON o."customerId" = c.id
             WHERE o."paymentStatus" IN ('unpaid','partial') AND o."isDeleted" = false
               AND c."currentBalance" > 0
             GROUP BY c.id, c.name, c.mobile, c."currentBalance"
             ORDER BY c."currentBalance" DESC LIMIT 10`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => []),

        // Last 5 purchase bills
        db.purchaseBill.findAll({
            order: [['createdAt', 'DESC']],
            limit: 5,
            attributes: ['billNumber', 'supplierName', 'total', 'paymentStatus', 'billDate'],
            raw: true,
        }).catch(() => []),

        // Product count and low stock
        db.sequelize.query(
            `SELECT COUNT(*) as total,
                    SUM(CASE WHEN "stockQuantity" IS NOT NULL AND "stockQuantity" < 5 THEN 1 ELSE 0 END) as low_stock
             FROM products WHERE "isActive" = true`,
            { type: db.sequelize.QueryTypes.SELECT }
        ).catch(() => [{}]),
    ]);

    const fmt = v => `₹${Number(v || 0).toLocaleString('en-IN')}`;

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
        `${o.orderNumber} | ${o.customerName || 'Walk-in'} | ${fmt(o.total)} | ${o.paymentStatus} | ${o.orderDate}`
    ).join('\n');

    const customersStr = (topCustomers.value || []).map(c =>
        `${c.name}${c.mobile ? ` (${c.mobile})` : ''}: owes ${fmt(c.currentBalance)}`
    ).join('\n');

    const suppliersStr = (topSuppliers.value || []).map(s =>
        `${s.name}: owed ${fmt(s.currentBalance)}`
    ).join('\n');

    const monthlyStr = (monthlySales.value || []).slice(0, 15).map(r =>
        `${r.orderDate}: ${fmt(r.sales)} (${r.orders} orders)`
    ).join('\n');

    const overdueStr = (overdueCustomers.value || []).map(c =>
        `${c.name}${c.mobile ? ` (${c.mobile})` : ''}: ${fmt(c.currentBalance)} due since ${c.oldest_due}`
    ).join('\n');

    const purchasesStr = (recentPurchases.value || []).map(p =>
        `${p.billNumber} | ${p.supplierName} | ${fmt(p.total)} | ${p.paymentStatus} | ${p.billDate}`
    ).join('\n');

    const pc = (productCount.value || [{}])[0];

    return `=== TODAY (${todayDDMMYYYY}) ===
${todayStr}

=== RECENT 10 ORDERS ===
${ordersStr || 'None'}

=== TOP CUSTOMERS (by outstanding balance) ===
${customersStr || 'None'}

=== OVERDUE CUSTOMERS (unpaid > 30 days) ===
${overdueStr || 'None'}

=== TOP SUPPLIERS (by owed amount) ===
${suppliersStr || 'None'}

=== RECENT PURCHASES ===
${purchasesStr || 'None'}

=== LAST 15 DAYS SALES ===
${monthlyStr || 'None'}

=== INVENTORY ===
Total active products: ${pc?.total || 0}
Low stock products (< 5 units): ${pc?.low_stock || 0}`;
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

You have access to the following real-time business data:

${context}

Guidelines:
- Answer in the same language the user writes (Hindi or English). Mix is fine.
- Format monetary values with ₹ symbol in Indian format (use lakh/crore for large numbers).
- Be concise and direct — shopkeeper is busy.
- If a customer/supplier name is mentioned, look them up in the data above.
- If data isn't available for a question, say so honestly.
- Today's date: ${moment().tz('Asia/Kolkata').format('DD MMM YYYY, dddd')}`;

            // Build message history (last 6 turns to stay within token limits)
            const messages = [
                { role: 'system', content: systemPrompt },
                ...history.slice(-6),
                { role: 'user', content: message.trim() },
            ];

            const completion = await client.chat.completions.create({
                model: 'deepseek-chat',
                messages,
                max_tokens: 512,
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
