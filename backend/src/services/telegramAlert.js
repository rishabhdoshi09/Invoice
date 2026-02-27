/**
 * Telegram Fraud Alert Service
 * 
 * Sends automated alerts to the admin's Telegram when suspicious
 * billing activity is detected. Also sends a daily summary.
 */

const https = require('https');
const db = require('../models');
const { Op } = require('sequelize');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ─── Send message via Telegram Bot API ───────────────────────────
function sendTelegram(text, parseMode = 'Markdown') {
    return new Promise((resolve, reject) => {
        if (!BOT_TOKEN || !CHAT_ID) {
            console.warn('[TELEGRAM] Bot token or chat ID not configured — skipping alert');
            return resolve({ skipped: true });
        }

        const payload = JSON.stringify({
            chat_id: CHAT_ID,
            text: text.substring(0, 4000), // Telegram limit is 4096
            parse_mode: parseMode,
            disable_web_page_preview: true
        });

        const options = {
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.ok) resolve(parsed);
                    else reject(new Error(`Telegram API error: ${parsed.description}`));
                } catch (e) { reject(e); }
            });
        });

        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Telegram request timeout')); });
        req.write(payload);
        req.end();
    });
}

// ─── Real-time alerts (fire-and-forget) ──────────────────────────

/**
 * Alert: Item deleted from bill before submission
 */
function alertItemDeleted(details) {
    const { itemName, quantity, price, totalPrice, type, invoiceContext, user, timestamp } = details;
    const msg = [
        `🚨 *ITEM DELETED FROM BILL*`,
        ``,
        `*Item:* ${itemName}`,
        `*Qty:* ${quantity} | *Price:* ₹${price} | *Value:* ₹${totalPrice}`,
        `*Type:* ${type === 'scale' ? '⚖️ Scale' : '✏️ Manual'}`,
        `*By:* ${user || 'Unknown'}`,
        `*Time:* ${new Date(timestamp || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
        invoiceContext ? `*Invoice:* ${invoiceContext.orderNumber || 'Draft'}` : ''
    ].filter(Boolean).join('\n');

    sendTelegram(msg).catch(e => console.error('[TELEGRAM] Alert failed:', e.message));
}

/**
 * Alert: Submitted bill deleted
 */
function alertBillDeleted(details) {
    const { orderNumber, total, customerName, user, timestamp } = details;
    const msg = [
        `🗑️ *BILL DELETED*`,
        ``,
        `*Invoice:* ${orderNumber}`,
        `*Amount:* ₹${(total || 0).toLocaleString('en-IN')}`,
        `*Customer:* ${customerName || 'Walk-in'}`,
        `*By:* ${user || 'Unknown'}`,
        `*Time:* ${new Date(timestamp || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
    ].join('\n');

    sendTelegram(msg).catch(e => console.error('[TELEGRAM] Alert failed:', e.message));
}

/**
 * Alert: Payment status toggled
 */
function alertPaymentToggle(details) {
    const { orderNumber, total, oldStatus, newStatus, changedBy, customerName } = details;
    const msg = [
        `💱 *PAYMENT STATUS CHANGED*`,
        ``,
        `*Invoice:* ${orderNumber}`,
        `*Amount:* ₹${(total || 0).toLocaleString('en-IN')}`,
        `*Customer:* ${customerName || 'Walk-in'}`,
        `*Changed:* ${oldStatus} → ${newStatus}`,
        `*By:* ${changedBy}`,
        `*Time:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
    ].join('\n');

    sendTelegram(msg).catch(e => console.error('[TELEGRAM] Alert failed:', e.message));
}

/**
 * Alert: Weight fetched but not used
 */
function alertUnusedWeight(details) {
    const { weight, userId, timestamp } = details;
    const msg = [
        `⚖️ *WEIGHT FETCHED — NOT USED*`,
        ``,
        `*Weight:* ${weight} kg`,
        `*Time:* ${new Date(timestamp || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
        `_This weight was read from the scale but never added to any bill_`
    ].join('\n');

    sendTelegram(msg).catch(e => console.error('[TELEGRAM] Alert failed:', e.message));
}

// ─── Daily Summary ───────────────────────────────────────────────

/**
 * Generate and send daily fraud summary to Telegram.
 * Called by the cron scheduler.
 */
async function sendDailySummary() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const dateRange = { [Op.gte]: today, [Op.lt]: tomorrow };

        // 1. Item deletions today
        let itemDeletions = 0;
        let totalDeletedValue = 0;
        try {
            const deletions = await db.billAuditLog.findAll({
                where: { eventType: 'ITEM_REMOVED', createdAt: dateRange }
            });
            itemDeletions = deletions.length;
            totalDeletedValue = deletions.reduce((sum, d) => {
                const det = d.details || {};
                return sum + (Number(det.totalPrice) || 0);
            }, 0);
        } catch (e) { /* table may not exist */ }

        // 2. Bills deleted today
        let billsDeleted = 0;
        let billsDeletedValue = 0;
        try {
            const bills = await db.billAuditLog.findAll({
                where: { eventType: 'BILL_DELETED', createdAt: dateRange }
            });
            billsDeleted = bills.length;
            billsDeletedValue = bills.reduce((sum, b) => {
                const det = b.details || {};
                return sum + (Number(det.total) || 0);
            }, 0);
        } catch (e) { /* table may not exist */ }

        // 3. Weight fetches today
        let weightFetches = 0;
        let unmatchedWeights = 0;
        try {
            const weights = await db.weightLog.findAll({
                where: { createdAt: dateRange }
            });
            weightFetches = weights.length;
            unmatchedWeights = weights.filter(w => w.status !== 'used').length;
        } catch (e) { /* table may not exist */ }

        // 4. Payment toggles today
        let paymentToggles = 0;
        try {
            const toggles = await db.journalBatch.count({
                where: { referenceType: 'PAYMENT_TOGGLE', createdAt: dateRange }
            });
            paymentToggles = toggles;
        } catch (e) { /* ok */ }

        // 5. Orders created and deleted same day
        let quickDeletes = 0;
        try {
            const deleted = await db.order.findAll({
                where: { isDeleted: true, deletedAt: dateRange, createdAt: dateRange }
            });
            quickDeletes = deleted.length;
        } catch (e) { /* ok */ }

        // 6. Total sales today
        let totalSales = 0;
        let orderCount = 0;
        try {
            const orders = await db.order.findAll({
                where: { isDeleted: false, createdAt: dateRange }
            });
            orderCount = orders.length;
            totalSales = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
        } catch (e) { /* ok */ }

        // Build alert level
        const redFlags = [];
        if (itemDeletions > 3) redFlags.push(`${itemDeletions} items deleted (>3 threshold)`);
        if (billsDeleted > 0) redFlags.push(`${billsDeleted} bill(s) deleted (₹${billsDeletedValue.toLocaleString('en-IN')})`);
        if (quickDeletes > 0) redFlags.push(`${quickDeletes} order(s) created & deleted same day`);
        if (unmatchedWeights > 2) redFlags.push(`${unmatchedWeights} scale readings unused`);
        if (paymentToggles > 4) redFlags.push(`${paymentToggles} payment toggles (>4 threshold)`);

        const alertLevel = redFlags.length >= 3 ? '🔴 HIGH' :
                          redFlags.length >= 1 ? '🟡 MEDIUM' : '🟢 CLEAN';

        const dateStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

        let msg = [
            `📋 *DAILY FRAUD SUMMARY — ${dateStr}*`,
            `Alert Level: ${alertLevel}`,
            ``,
            `*Activity:*`,
            `• Orders: ${orderCount} (₹${totalSales.toLocaleString('en-IN')})`,
            `• Items deleted from bills: ${itemDeletions} (₹${totalDeletedValue.toLocaleString('en-IN')})`,
            `• Bills deleted: ${billsDeleted} (₹${billsDeletedValue.toLocaleString('en-IN')})`,
            `• Weight readings: ${weightFetches} (${unmatchedWeights} unused)`,
            `• Payment toggles: ${paymentToggles}`,
            `• Quick create-delete: ${quickDeletes}`,
        ];

        if (redFlags.length > 0) {
            msg.push('');
            msg.push('*⚠️ Red Flags:*');
            redFlags.forEach(f => msg.push(`• ${f}`));
        } else {
            msg.push('');
            msg.push('_No suspicious activity detected today._');
        }

        await sendTelegram(msg.join('\n'));
        console.log(`[TELEGRAM] Daily summary sent — ${alertLevel}`);
        return { sent: true, alertLevel, redFlags };

    } catch (error) {
        console.error('[TELEGRAM] Failed to send daily summary:', error.message);
        return { sent: false, error: error.message };
    }
}

// ─── Manual trigger: send summary for any date range ─────────────
async function sendSummaryForRange(startDate, endDate) {
    // Reuse daily summary logic with custom range
    // For now, just trigger the daily one
    return await sendDailySummary();
}

module.exports = {
    sendTelegram,
    alertItemDeleted,
    alertBillDeleted,
    alertPaymentToggle,
    alertUnusedWeight,
    sendDailySummary,
    sendSummaryForRange
};
