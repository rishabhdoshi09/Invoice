/**
 * Telegram Fraud Alert Service
 * 
 * Sends automated alerts to the admin's Telegram when suspicious
 * billing activity is detected. Also sends a daily summary.
 */

const https = require('https');
const dns = require('dns');
const db = require('../models');
const { Op } = require('sequelize');

// Force IPv4 DNS resolution (fixes ETIMEDOUT on IPv6 networks)
dns.setDefaultResultOrder('ipv4first');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ─── Send message via Telegram Bot API ───────────────────────────
function sendTelegram(text, parseMode = 'HTML') {
    return new Promise((resolve, reject) => {
        if (!BOT_TOKEN || !CHAT_ID) {
            console.warn('[TELEGRAM] Bot token or chat ID not configured — skipping alert');
            return resolve({ skipped: true });
        }

        const payload = JSON.stringify({
            chat_id: CHAT_ID,
            text: text.substring(0, 4000),
            parse_mode: parseMode,
            disable_web_page_preview: true
        });

        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            family: 4,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, (res) => {
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

// ─── Escape HTML special chars in user data ─────────────────────
function esc(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Real-time alerts (fire-and-forget) ──────────────────────────

function alertItemDeleted(details) {
    const { itemName, quantity, price, totalPrice, type, invoiceContext, user, timestamp } = details;
    const msg = [
        `🚨 <b>ITEM DELETED FROM BILL</b>`,
        ``,
        `<b>Item:</b> ${esc(itemName)}`,
        `<b>Qty:</b> ${quantity} | <b>Price:</b> ₹${price} | <b>Value:</b> ₹${totalPrice}`,
        `<b>Type:</b> ${type === 'scale' ? '⚖️ Scale' : '✏️ Manual'}`,
        `<b>By:</b> ${esc(user) || 'Unknown'}`,
        `<b>Time:</b> ${new Date(timestamp || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
        invoiceContext ? `<b>Invoice:</b> ${esc(invoiceContext.orderNumber || 'Draft')}` : ''
    ].filter(Boolean).join('\n');
    sendTelegram(msg).catch(e => console.error('[TELEGRAM] Alert failed:', e.message));
}

function alertBillDeleted(details) {
    const { orderNumber, total, customerName, user, timestamp } = details;
    const msg = [
        `🗑️ <b>BILL DELETED</b>`,
        ``,
        `<b>Invoice:</b> ${esc(orderNumber)}`,
        `<b>Amount:</b> ₹${(total || 0).toLocaleString('en-IN')}`,
        `<b>Customer:</b> ${esc(customerName) || 'Walk-in'}`,
        `<b>By:</b> ${esc(user) || 'Unknown'}`,
        `<b>Time:</b> ${new Date(timestamp || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
    ].join('\n');
    sendTelegram(msg).catch(e => console.error('[TELEGRAM] Alert failed:', e.message));
}

function alertPaymentToggle(details) {
    const { orderNumber, total, oldStatus, newStatus, changedBy, customerName } = details;
    const msg = [
        `💱 <b>PAYMENT STATUS CHANGED</b>`,
        ``,
        `<b>Invoice:</b> ${esc(orderNumber)}`,
        `<b>Amount:</b> ₹${(total || 0).toLocaleString('en-IN')}`,
        `<b>Customer:</b> ${esc(customerName) || 'Walk-in'}`,
        `<b>Changed:</b> ${oldStatus} → ${newStatus}`,
        `<b>By:</b> ${esc(changedBy)}`,
        `<b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
    ].join('\n');
    sendTelegram(msg).catch(e => console.error('[TELEGRAM] Alert failed:', e.message));
}

function alertUnusedWeight(details) {
    const { weight, userId, timestamp } = details;
    const msg = [
        `⚖️ <b>WEIGHT FETCHED — NOT USED</b>`,
        ``,
        `<b>Weight:</b> ${weight} kg`,
        `<b>Time:</b> ${new Date(timestamp || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
        `<i>This weight was read from the scale but never added to any bill</i>`
    ].join('\n');
    sendTelegram(msg).catch(e => console.error('[TELEGRAM] Alert failed:', e.message));
}

/**
 * Alert: New sales order/bill created
 */
function alertOrderCreated(details) {
    const { orderNumber, customerName, total, paidAmount, dueAmount, paymentStatus, items, createdBy, orderDate } = details;
    const isPaid = paymentStatus === 'paid';
    const statusIcon = isPaid ? '✅' : '🔴';
    const statusText = isPaid ? 'PAID' : `DUE ₹${(dueAmount || 0).toLocaleString('en-IN')}`;

    let msg = [
        `🧾 <b>NEW BILL CREATED</b>`,
        ``,
        `<b>Invoice:</b> ${esc(orderNumber)}`,
        `<b>Customer:</b> ${esc(customerName) || 'Walk-in'}`,
        `<b>Total:</b> ₹${(total || 0).toLocaleString('en-IN')} ${statusIcon} ${statusText}`,
    ];

    // Item list
    if (items && items.length > 0) {
        msg.push(``, `<b>Items:</b>`);
        for (const item of items.slice(0, 15)) {
            const qty = item.quantity || item.qty || 0;
            const price = item.productPrice || item.price || 0;
            const itemTotal = item.totalPrice || (qty * price) || 0;
            msg.push(`  • ${esc(item.name)} — ${qty} x ₹${price} = <b>₹${itemTotal.toLocaleString('en-IN')}</b>`);
        }
        if (items.length > 15) {
            msg.push(`  <i>...and ${items.length - 15} more items</i>`);
        }
    }

    msg.push(
        ``,
        `<b>By:</b> ${esc(createdBy) || '?'}`,
        `<b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
    );

    sendTelegram(msg.join('\n')).catch(e => console.error('[TELEGRAM] Alert failed:', e.message));
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
            `📋 <b>DAILY FRAUD SUMMARY — ${dateStr}</b>`,
            `Alert Level: ${alertLevel}`,
            ``,
            `<b>Activity:</b>`,
            `• Orders: ${orderCount} (₹${totalSales.toLocaleString('en-IN')})`,
            `• Items deleted from bills: ${itemDeletions} (₹${totalDeletedValue.toLocaleString('en-IN')})`,
            `• Bills deleted: ${billsDeleted} (₹${billsDeletedValue.toLocaleString('en-IN')})`,
            `• Weight readings: ${weightFetches} (${unmatchedWeights} unused)`,
            `• Payment toggles: ${paymentToggles}`,
            `• Quick create-delete: ${quickDeletes}`,
        ];

        if (redFlags.length > 0) {
            msg.push('');
            msg.push('<b>⚠️ Red Flags:</b>');
            redFlags.forEach(f => msg.push(`• ${esc(f)}`));
        } else {
            msg.push('');
            msg.push('<i>No suspicious activity detected today.</i>');
        }

        await sendTelegram(msg.join('\n'));
        console.log(`[TELEGRAM] Daily summary sent — ${alertLevel}`);
        return { sent: true, alertLevel, redFlags };

    } catch (error) {
        console.error('[TELEGRAM] Failed to send daily summary:', error.message);
        return { sent: false, error: error.message };
    }
}

// ─── Full Audit Report (mirrors /bill-audit page) ────────────────

/**
 * Send complete bill audit report to Telegram.
 * Mirrors the /bill-audit UI — both "Item Deletions" and "Weight Fetches" tabs.
 * Splits into multiple messages if needed (Telegram 4096 char limit).
 * 
 * @param {Object} options - { startDate, endDate } (defaults to today)
 */
async function sendFullAuditReport(options = {}) {
    try {
        const { Op } = require('sequelize');
        const startDate = options.startDate ? new Date(options.startDate) : new Date(new Date().setHours(0, 0, 0, 0));
        const endDate = options.endDate ? new Date(new Date(options.endDate).setHours(23, 59, 59, 999)) : new Date(new Date().setHours(23, 59, 59, 999));
        const dateRange = { [Op.gte]: startDate, [Op.lte]: endDate };
        const dateLabel = startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

        const messages = [];

        // ═══════════════════════════════════════════════
        // PART 1: ITEM DELETIONS TAB
        // ═══════════════════════════════════════════════
        let auditLogs = [];
        try {
            auditLogs = await db.billAuditLog.findAll({
                where: { createdAt: dateRange },
                order: [['createdAt', 'DESC']]
            });
        } catch (e) { /* table may not exist */ }

        const itemRemovals = auditLogs.filter(l => l.eventType === 'ITEM_REMOVED');
        const billClears = auditLogs.filter(l => l.eventType === 'BILL_CLEARED');
        const billDeletes = auditLogs.filter(l => l.eventType === 'BILL_DELETED');
        const totalDeletedValue = auditLogs.reduce((s, l) => s + (Number(l.totalPrice) || 0), 0);

        const fmt = (v) => `₹${(Number(v) || 0).toLocaleString('en-IN')}`;
        const timeStr = (d) => new Date(d).toLocaleString('en-IN', { 
            hour: '2-digit', minute: '2-digit', second: '2-digit', 
            hour12: true, timeZone: 'Asia/Kolkata' 
        });

        // Header message
        let header = [
            `📊 <b>COMPLETE BILL AUDIT REPORT</b>`,
            `📅 ${dateLabel}`,
            ``,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `📋 <b>TAB 1: ITEM DELETIONS</b>`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            ``,
            `<b>Summary:</b>`,
            `• Item Removals: <b>${itemRemovals.length}</b>`,
            `• Bill Clears: <b>${billClears.length}</b>`,
            `• Bill Deletes: <b>${billDeletes.length}</b>`,
            `• Total Deleted Value: <b>${fmt(totalDeletedValue)}</b>`,
        ];

        if (itemRemovals.length === 0 && billClears.length === 0 && billDeletes.length === 0) {
            header.push('', '<i>No deletion events recorded.</i>');
        }

        messages.push(header.join('\n'));

        // Item removal details (batched to fit Telegram limit)
        if (itemRemovals.length > 0) {
            let batch = [``, `<b>🚨 Item Removals (${itemRemovals.length}):</b>`, ``];

            for (let i = 0; i < itemRemovals.length; i++) {
                const log = itemRemovals[i];
                const isScale = log.deviceInfo?.includes('WEIGHTED');
                const entry = [
                    `<b>${i + 1}.</b> ${esc(log.productName)}`,
                    `   Qty: ${log.quantity || '-'} | Price: ${fmt(log.price)} | Value: <b>${fmt(log.totalPrice)}</b>`,
                    `   Type: ${isScale ? '⚖️ Scale' : '✏️ Manual'} | By: ${esc(log.userName) || '?'}`,
                    `   Time: ${timeStr(log.createdAt)}`,
                    log.invoiceContext ? `   Invoice: <code>${esc(log.invoiceContext)}</code>` : '',
                    log.customerName ? `   Customer: ${esc(log.customerName)}` : '',
                    ``
                ].filter(Boolean).join('\n');

                if ((batch.join('\n') + entry).length > 3800) {
                    messages.push(batch.join('\n'));
                    batch = [`<b>...continued:</b>`, ``];
                }
                batch.push(entry);
            }
            if (batch.length > 2) messages.push(batch.join('\n'));
        }

        // Bill clears
        if (billClears.length > 0) {
            let batch = [`<b>🧹 Bill Clears (${billClears.length}):</b>`, ``];
            for (const log of billClears) {
                batch.push(`• ${esc(log.productName)} — ${fmt(log.totalPrice)} | By: ${esc(log.userName)} | ${timeStr(log.createdAt)}`);
            }
            messages.push(batch.join('\n'));
        }

        // Bill deletes
        if (billDeletes.length > 0) {
            let batch = [`<b>🗑️ Bill Deletes (${billDeletes.length}):</b>`, ``];
            for (const log of billDeletes) {
                batch.push([
                    `• ${esc(log.productName) || 'Bill'} — <b>${fmt(log.totalPrice)}</b>`,
                    `  By: ${esc(log.userName)} | ${timeStr(log.createdAt)}`,
                    log.invoiceContext ? `  Invoice: <code>${esc(log.invoiceContext)}</code>` : '',
                    ``
                ].filter(Boolean).join('\n'));
            }
            messages.push(batch.join('\n'));
        }

        // ═══════════════════════════════════════════════
        // PART 2: WEIGHT FETCHES TAB
        // ═══════════════════════════════════════════════
        let weightLogs = [];
        try {
            weightLogs = await db.weightLog.findAll({
                where: { createdAt: dateRange },
                order: [['createdAt', 'DESC']]
            });
        } catch (e) { /* table may not exist */ }

        const consumedWeights = weightLogs.filter(w => w.consumed);
        const unmatchedWeights = weightLogs.filter(w => !w.consumed);
        const totalUnmatchedKg = unmatchedWeights.reduce((s, w) => s + (Number(w.weight) || 0), 0);

        let weightMsg = [
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `⚖️ <b>TAB 2: WEIGHT FETCHES</b>`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            ``,
            `<b>Summary:</b>`,
            `• Total Fetches: <b>${weightLogs.length}</b>`,
            `• Added to Bill: <b>${consumedWeights.length}</b>`,
            `• NOT Added to Bill: <b>${unmatchedWeights.length}</b>${unmatchedWeights.length > 0 ? ' ⚠️' : ''}`,
            `• Unmatched Weight: <b>${totalUnmatchedKg.toFixed(2)} kg</b>`,
        ];

        if (weightLogs.length === 0) {
            weightMsg.push('', '<i>No weight readings recorded.</i>');
        }

        if (unmatchedWeights.length > 0) {
            weightMsg.push('', `<b>⚠️ Unmatched Weights (${unmatchedWeights.length}):</b>`, ``);
            for (const w of unmatchedWeights.slice(0, 20)) {
                weightMsg.push(`• <b>${Number(w.weight).toFixed(3)} kg</b> — ${timeStr(w.createdAt)} — By: ${esc(w.userName) || '?'}`);
            }
            if (unmatchedWeights.length > 20) {
                weightMsg.push(`<i>...and ${unmatchedWeights.length - 20} more</i>`);
            }
        }

        if (consumedWeights.length > 0) {
            weightMsg.push('', `<b>✅ Added to Bill (${consumedWeights.length}):</b>`, ``);
            for (const w of consumedWeights.slice(0, 15)) {
                weightMsg.push(`• ${Number(w.weight).toFixed(3)} kg → ${esc(w.orderNumber) || '?'} | ${timeStr(w.createdAt)}`);
            }
            if (consumedWeights.length > 15) {
                weightMsg.push(`<i>...and ${consumedWeights.length - 15} more</i>`);
            }
        }

        messages.push(weightMsg.join('\n'));

        // ═══════════════════════════════════════════════
        // PART 3: PAYMENT TOGGLES
        // ═══════════════════════════════════════════════
        let toggleCount = 0;
        try {
            toggleCount = await db.journalBatch.count({
                where: { referenceType: 'PAYMENT_TOGGLE', createdAt: dateRange }
            });
        } catch (e) { /* ok */ }

        if (toggleCount > 0) {
            let toggleMsg = [
                ``,
                `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `💱 <b>PAYMENT TOGGLES: ${toggleCount}</b>`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            ];

            try {
                const toggleBatches = await db.journalBatch.findAll({
                    where: { referenceType: 'PAYMENT_TOGGLE', createdAt: dateRange },
                    order: [['createdAt', 'DESC']],
                    limit: 20
                });
                for (const b of toggleBatches) {
                    toggleMsg.push(`• ${esc((b.description || 'Toggle').substring(0, 80))} — ₹${b.totalDebit}`);
                }
            } catch (e) { /* ok */ }

            messages.push(toggleMsg.join('\n'));
        }

        // ═══════════════════════════════════════════════
        // FOOTER
        // ═══════════════════════════════════════════════
        const redFlags = [];
        if (itemRemovals.length > 3) redFlags.push(`${itemRemovals.length} items deleted`);
        if (billDeletes.length > 0) redFlags.push(`${billDeletes.length} bills deleted`);
        if (unmatchedWeights.length > 2) redFlags.push(`${unmatchedWeights.length} unused weights`);
        if (toggleCount > 4) redFlags.push(`${toggleCount} payment toggles`);

        const alertLevel = redFlags.length >= 3 ? '🔴 HIGH RISK' :
                          redFlags.length >= 1 ? '🟡 NEEDS ATTENTION' : '🟢 ALL CLEAR';

        let footer = [
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `<b>Overall: ${alertLevel}</b>`,
        ];
        if (redFlags.length > 0) {
            footer.push('Red flags: ' + redFlags.map(f => esc(f)).join(', '));
        }
        footer.push(`<i>Report generated at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>`);

        messages.push(footer.join('\n'));

        // Send all messages sequentially
        for (const msg of messages) {
            if (msg.trim()) {
                await sendTelegram(msg);
                // Small delay between messages to avoid rate limiting
                await new Promise(r => setTimeout(r, 300));
            }
        }

        console.log(`[TELEGRAM] Full audit report sent (${messages.length} messages)`);
        return { sent: true, messageCount: messages.length, alertLevel };

    } catch (error) {
        console.error('[TELEGRAM] Failed to send full audit report:', error.message);
        throw error;
    }
}

module.exports = {
    sendTelegram,
    esc,
    alertItemDeleted,
    alertBillDeleted,
    alertPaymentToggle,
    alertUnusedWeight,
    alertOrderCreated,
    sendDailySummary,
    sendFullAuditReport
};
