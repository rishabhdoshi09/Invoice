/**
 * Telegram Fraud Alert Service
 * 
 * Sends automated alerts to the admin's Telegram when suspicious
 * billing activity is detected. Also sends a daily summary.
 */

const https = require('https');
const dns = require('dns');
const zlib = require('zlib');
const path = require('path');
const { spawn } = require('child_process');
const db = require('../models');
const { Op } = require('sequelize');

// Force IPv4 DNS resolution (fixes ETIMEDOUT on IPv6 networks)
dns.setDefaultResultOrder('ipv4first');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ─── Send message via Telegram Bot API (with exponential backoff retry) ───
function sendTelegram(text, parseMode = 'HTML', retries = 3) {
    return new Promise((resolve, reject) => {
        if (!BOT_TOKEN || !CHAT_ID) {
            console.warn('[TELEGRAM] Bot token or chat ID not configured — skipping alert');
            return resolve({ skipped: true });
        }

        const attempt = (attemptNum) => {
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
                        if (parsed.ok) {
                            resolve(parsed);
                        } else if (parsed.error_code === 429 && attemptNum < retries) {
                            // Rate limited — retry with backoff
                            const retryAfter = (parsed.parameters?.retry_after || 1) * 1000;
                            console.warn(`[TELEGRAM] Rate limited, retry ${attemptNum + 1}/${retries} after ${retryAfter}ms`);
                            setTimeout(() => attempt(attemptNum + 1), retryAfter);
                        } else if (attemptNum < retries) {
                            const delay = Math.pow(2, attemptNum) * 1000;
                            console.warn(`[TELEGRAM] API error (attempt ${attemptNum + 1}/${retries}): ${parsed.description}, retrying in ${delay}ms`);
                            setTimeout(() => attempt(attemptNum + 1), delay);
                        } else {
                            reject(new Error(`Telegram API error after ${retries} attempts: ${parsed.description}`));
                        }
                    } catch (e) { reject(e); }
                });
            });

            req.on('error', (err) => {
                if (attemptNum < retries) {
                    const delay = Math.pow(2, attemptNum) * 1000;
                    console.warn(`[TELEGRAM] Network error (attempt ${attemptNum + 1}/${retries}): ${err.message}, retrying in ${delay}ms`);
                    setTimeout(() => attempt(attemptNum + 1), delay);
                } else {
                    reject(new Error(`Telegram network error after ${retries} attempts: ${err.message}`));
                }
            });
            req.setTimeout(10000, () => {
                req.destroy();
                if (attemptNum < retries) {
                    const delay = Math.pow(2, attemptNum) * 1000;
                    console.warn(`[TELEGRAM] Timeout (attempt ${attemptNum + 1}/${retries}), retrying in ${delay}ms`);
                    setTimeout(() => attempt(attemptNum + 1), delay);
                } else {
                    reject(new Error(`Telegram timeout after ${retries} attempts`));
                }
            });
            req.write(payload);
            req.end();
        };

        attempt(0);
    });
}

// ─── Send document (file) via Telegram Bot API ───────────────────
function sendTelegramDocument(fileBuffer, filename, caption) {
    return new Promise((resolve, reject) => {
        if (!BOT_TOKEN || !CHAT_ID) {
            console.warn('[TELEGRAM] Bot token or chat ID not configured — skipping document send');
            return resolve({ skipped: true });
        }

        const boundary = `tgboundary${Date.now()}`;
        const parts = [];

        // chat_id
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${CHAT_ID}\r\n`));
        // caption
        if (caption) {
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption.substring(0, 1024)}\r\n`));
        }
        // document
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${filename}"\r\nContent-Type: application/gzip\r\n\r\n`));
        parts.push(fileBuffer);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

        const body = Buffer.concat(parts);

        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/sendDocument`,
            method: 'POST',
            family: 4,
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.ok) resolve(parsed);
                    else reject(new Error(`Telegram sendDocument error: ${parsed.description}`));
                } catch (e) { reject(e); }
            });
        });

        req.on('error', reject);
        req.setTimeout(60000, () => { req.destroy(); reject(new Error('Telegram sendDocument timeout')); });
        req.write(body);
        req.end();
    });
}

// ─── Create compressed pg_dump buffer ────────────────────────────
function createBackupBuffer() {
    return new Promise((resolve, reject) => {
        // Use the same env var names as docker-compose and the rest of the app:
        //   PASSWORD (not DB_PASS) and DATABASE_NAME (not DB_NAME).
        // Previously these were wrong, causing pg_dump to connect to the default
        // 'postgres' db with no password — producing an empty/wrong backup.
        const dbUrl = process.env.DATABASE_URL ||
            `postgres://${process.env.DB_USER || 'postgres'}:${encodeURIComponent(process.env.PASSWORD || '')}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DATABASE_NAME || 'postgres'}`;

        const pgDump = spawn('pg_dump', ['--no-owner', '--no-acl', dbUrl], {
            env: { ...process.env, PGPASSWORD: process.env.PASSWORD || '' }
        });
        const gzip = zlib.createGzip({ level: 6 });

        const chunks = [];
        pgDump.stdout.pipe(gzip);
        gzip.on('data', chunk => chunks.push(chunk));
        gzip.on('end', () => resolve(Buffer.concat(chunks)));
        gzip.on('error', reject);

        let stderrOutput = '';
        pgDump.stderr.on('data', d => { stderrOutput += d.toString(); });
        pgDump.on('close', code => {
            if (code !== 0) {
                reject(new Error(`pg_dump exited with code ${code}: ${stderrOutput.substring(0, 200)}`));
            }
        });
    });
}

// ─── Local backup directory — works in Docker (/app/backups) and locally ─────
// In Docker, set BACKUP_DIR=/app/backups in your env. Locally it falls back
// to Invoice/backups/ which is always writable without special permissions.
const LOCAL_BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../../backups');
const LOCAL_BACKUP_RETAIN_DAYS = parseInt(process.env.BACKUP_RETAIN_DAYS || '30', 10);

/**
 * Write the backup buffer to the local filesystem.
 * Always runs regardless of Telegram configuration.
 * Returns the file path on success, or throws on write failure.
 */
function writeLocalBackup(buf, filename) {
    const fs = require('fs');
    const path = require('path');
    try {
        if (!fs.existsSync(LOCAL_BACKUP_DIR)) {
            fs.mkdirSync(LOCAL_BACKUP_DIR, { recursive: true });
        }
        const filePath = path.join(LOCAL_BACKUP_DIR, filename);
        fs.writeFileSync(filePath, buf);
        console.log(`[BACKUP] Local backup written: ${filePath} (${(buf.length / 1048576).toFixed(2)} MB)`);
        return filePath;
    } catch (err) {
        throw new Error(`[BACKUP] Failed to write local backup: ${err.message}`);
    }
}

/**
 * Delete local backup files older than LOCAL_BACKUP_RETAIN_DAYS days.
 * Errors are logged but do not abort the backup process.
 */
function pruneOldLocalBackups() {
    const fs = require('fs');
    const path = require('path');
    try {
        if (!fs.existsSync(LOCAL_BACKUP_DIR)) return;
        const cutoffMs = Date.now() - LOCAL_BACKUP_RETAIN_DAYS * 24 * 3600 * 1000;
        const files = fs.readdirSync(LOCAL_BACKUP_DIR);
        for (const file of files) {
            if (!file.startsWith('invoice_backup_') && !file.startsWith('backup_')) continue;
            const filePath = path.join(LOCAL_BACKUP_DIR, file);
            try {
                const stat = fs.statSync(filePath);
                if (stat.mtimeMs < cutoffMs) {
                    fs.unlinkSync(filePath);
                    console.log(`[BACKUP] Pruned old backup: ${file}`);
                }
            } catch (e) {
                console.warn(`[BACKUP] Could not prune ${file}: ${e.message}`);
            }
        }
    } catch (err) {
        console.warn('[BACKUP] Prune step failed:', err.message);
    }
}

/**
 * Run a database backup and send to Telegram as a document.
 * Called by the nightly cron job at 11 PM IST.
 *
 * Strategy (fail-safe ordering):
 *   1. Create the backup buffer (pg_dump | gzip).
 *   2. Write to LOCAL filesystem — this ALWAYS runs. If it fails, abort and alert.
 *   3. Send to Telegram — best-effort. If Telegram fails (network, >50 MB limit,
 *      bot not configured), the local copy is still intact and an alert is sent.
 *   4. Prune local backups older than BACKUP_RETAIN_DAYS days.
 */
async function sendDailyBackup() {
    const dateStr = new Date().toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
    });
    const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    const isoDate = new Date().toISOString().slice(0, 10);
    const filename = `invoice_backup_${isoDate}.sql.gz`;

    console.log('[BACKUP] Starting nightly database backup...');

    let buf;
    try {
        buf = await createBackupBuffer();
    } catch (err) {
        console.error('[BACKUP] pg_dump failed:', err.message);
        sendTelegram(`❌ <b>NIGHTLY BACKUP FAILED — pg_dump error</b>\n<b>Date:</b> ${dateStr}\n<b>Error:</b> ${esc(err.message)}`)
            .catch(() => {});
        return { sent: false, localWritten: false, error: err.message };
    }

    const sizeMB = (buf.length / 1048576).toFixed(2);

    // Step 2: Write local copy — primary backup, must succeed.
    let localPath;
    try {
        localPath = writeLocalBackup(buf, filename);
    } catch (err) {
        console.error('[BACKUP] Local write failed:', err.message);
        sendTelegram(`❌ <b>NIGHTLY BACKUP FAILED — local write error</b>\n<b>Date:</b> ${dateStr}\n<b>Error:</b> ${esc(err.message)}`)
            .catch(() => {});
        return { sent: false, localWritten: false, error: err.message };
    }

    // Step 3: Send to Telegram — best-effort secondary copy.
    let telegramSent = false;
    try {
        await sendTelegramDocument(buf, filename,
            `📦 Auto Daily Backup — ${dateStr}\nSize: ${sizeMB} MB\nTime: ${timeStr} IST\n✅ Database backup complete`
        );
        telegramSent = true;
        console.log(`[BACKUP] Nightly backup sent to Telegram — ${sizeMB} MB`);
    } catch (err) {
        // Telegram failure is non-fatal — local backup is already written.
        console.error('[BACKUP] Telegram send failed (local backup still intact):', err.message);
        sendTelegram(
            `⚠️ <b>BACKUP: Telegram upload failed</b>\n` +
            `<b>Date:</b> ${dateStr}\n` +
            `<b>Local copy:</b> ✅ written (${sizeMB} MB)\n` +
            `<b>Telegram:</b> ❌ ${esc(err.message)}`
        ).catch(() => {});
    }

    // Step 4: Prune stale local backups.
    pruneOldLocalBackups();

    return { sent: telegramSent, localWritten: true, sizeMB, localPath };
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
 * Compute expected cash in drawer for today.
 * Formula: Opening Balance + Cash Sales + Customer Receipts - Supplier Payments - Expenses
 */
async function getExpectedCashInDrawer() {
    try {
        const moment = require('moment-timezone');
        const today = moment().format('YYYY-MM-DD');
        const todayDDMMYYYY = moment().format('DD-MM-YYYY');

        // 1. Opening balance from daily summary
        let openingBalance = 0;
        const summary = await db.dailySummary.findOne({ where: { date: today } });
        if (summary) openingBalance = Number(summary.openingBalance) || 0;

        // 2. Cash sales = total from CASH mode orders ONLY (not paidAmount)
        const orders = await db.order.findAll({
            where: { orderDate: todayDDMMYYYY, isDeleted: false }
        });
        const cashOrders = orders.filter(o => o.paymentMode === 'CASH');
        const cashSales = cashOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const totalOrders = orders.length;
        const paidOrders = orders.filter(o => o.paymentStatus === 'paid').length;

        // 3. Payments breakdown
        const dateFormats = [
            todayDDMMYYYY,
            moment().format('DD/MM/YYYY'),
            moment().format('YYYY-MM-DD')
        ];
        const payments = await db.payment.findAll({
            where: { isDeleted: false, paymentDate: { [Op.in]: dateFormats } }
        });

        // Customer receipts: Exclude PAY-TOGGLE-* AND payments linked to today's CASH orders (already in Cash Sales)
        const todaysCashOrderIds = cashOrders.map(o => String(o.id));
        const allCustomerPayments = payments.filter(p => 
            p.partyType === 'customer' && !(p.paymentNumber && p.paymentNumber.startsWith('PAY-TOGGLE-'))
        );
        const customerReceipts = allCustomerPayments
            .filter(p => {
                if (p.referenceType === 'order' && p.referenceId) {
                    return !todaysCashOrderIds.includes(String(p.referenceId));
                }
                return true;
            })
            .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        const supplierPayments = payments.filter(p => p.partyType === 'supplier').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        const expenses = payments.filter(p => p.partyType === 'expense').reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        const expectedCash = openingBalance + cashSales + customerReceipts - supplierPayments - expenses;

        return { expectedCash, openingBalance, cashSales, customerReceipts, supplierPayments, expenses, totalOrders, paidOrders };
    } catch (e) {
        console.error('[TELEGRAM] Failed to compute cash in drawer:', e.message);
        return null;
    }
}

/**
 * Alert: New sales order/bill created
 */
async function alertOrderCreated(details) {
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
            const altName = item.altName && item.altName.trim();
            const displayName = altName ? esc(altName) : esc(item.name);
            msg.push(`  • ${displayName} — ${qty} x ₹${price} = <b>₹${itemTotal.toLocaleString('en-IN')}</b>`);
        }
        if (items.length > 15) {
            msg.push(`  <i>...and ${items.length - 15} more items</i>`);
        }
    }

    // Closing balance (Expected Cash in Drawer)
    const cashData = await getExpectedCashInDrawer();
    if (cashData) {
        msg.push(``);
        msg.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        msg.push(`💰 <b>Expected Cash in Drawer</b>`);
        msg.push(`<b>₹${cashData.expectedCash.toLocaleString('en-IN')}</b>`);
        msg.push(`<i>OB: ₹${cashData.openingBalance.toLocaleString('en-IN')} + Sales: ₹${cashData.cashSales.toLocaleString('en-IN')} + Recv: ₹${cashData.customerReceipts.toLocaleString('en-IN')} − Pay: ₹${cashData.supplierPayments.toLocaleString('en-IN')} − Exp: ₹${cashData.expenses.toLocaleString('en-IN')}</i>`);
        msg.push(`<i>Today: ${cashData.totalOrders} orders (${cashData.paidOrders} paid)</i>`);
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

// ─── Today's payment status (for /status command) ────────────────
async function sendTodayStatus() {
    try {
        const moment = require('moment-timezone');
        const todayDDMMYYYY = moment().tz('Asia/Kolkata').format('DD-MM-YYYY');
        const todayYYYYMMDD = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');

        const payments = await db.payment.findAll({
            where: {
                isDeleted: false,
                paymentDate: { [Op.in]: [todayDDMMYYYY, todayYYYYMMDD] }
            },
            order: [['createdAt', 'DESC']]
        });

        const inPay  = payments.filter(p => p.partyType === 'customer');
        const outPay = payments.filter(p => p.partyType === 'supplier');
        const totalIn  = inPay.reduce((s, p)  => s + Number(p.amount), 0);
        const totalOut = outPay.reduce((s, p) => s + Number(p.amount), 0);

        const orders = await db.order.findAll({
            where: { isDeleted: false, orderDate: todayDDMMYYYY }
        });
        const totalSales = orders.reduce((s, o) => s + Number(o.total || 0), 0);

        let msg = [
            `📊 <b>TODAY'S STATUS — ${todayDDMMYYYY}</b>`,
            ``,
            `🧾 <b>Orders:</b> ${orders.length} | ₹${totalSales.toLocaleString('en-IN')}`,
            `💰 <b>Received (Customer):</b> ${inPay.length} | ₹${totalIn.toLocaleString('en-IN')}`,
            `💸 <b>Paid Out (Supplier):</b> ${outPay.length} | ₹${totalOut.toLocaleString('en-IN')}`,
        ];

        if (inPay.length > 0) {
            msg.push(``, `<b>Customer Payments:</b>`);
            for (const p of inPay.slice(0, 10)) {
                msg.push(`• ${esc(p.paymentNumber)} — ₹${Number(p.amount).toLocaleString('en-IN')} — ${esc(p.partyName)}`);
            }
            if (inPay.length > 10) msg.push(`  <i>...and ${inPay.length - 10} more</i>`);
        }
        if (outPay.length > 0) {
            msg.push(``, `<b>Supplier Payments:</b>`);
            for (const p of outPay.slice(0, 10)) {
                msg.push(`• ${esc(p.paymentNumber)} — ₹${Number(p.amount).toLocaleString('en-IN')} — ${esc(p.partyName)}`);
            }
            if (outPay.length > 10) msg.push(`  <i>...and ${outPay.length - 10} more</i>`);
        }

        msg.push(``, `<i>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</i>`);
        await sendTelegram(msg.join('\n'));
    } catch (e) {
        console.error('[TELEGRAM] sendTodayStatus failed:', e.message);
        await sendTelegram(`❌ Status fetch failed: ${esc(e.message)}`).catch(() => {});
    }
}

// ─── Telegram Command Polling ─────────────────────────────────────
// Polls getUpdates every 5 seconds to receive commands from Telegram.
// Supported commands:
//   /backup  — run database backup now
//   /status  — today's payment & order summary
//   /audit   — full bill audit report
//   /help    — list available commands

let _lastUpdateId = 0;
let _pollingActive = false;

function _getUpdates() {
    return new Promise((resolve) => {
        if (!BOT_TOKEN) return resolve([]);
        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/getUpdates?offset=${_lastUpdateId + 1}&timeout=0&allowed_updates=%5B%22message%22%5D`,
            method: 'GET',
            family: 4,
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.ok && parsed.result.length > 0) {
                        _lastUpdateId = parsed.result[parsed.result.length - 1].update_id;
                        resolve(parsed.result);
                    } else {
                        resolve([]);
                    }
                } catch (e) { resolve([]); }
            });
        });
        req.on('error', () => resolve([]));
        req.setTimeout(15000, () => { req.destroy(); resolve([]); });
        req.end();
    });
}

async function _handleCommand(text) {
    const cmd = (text || '').trim().split(/\s+/)[0].toLowerCase().split('@')[0];
    console.log(`[TELEGRAM] Command: ${cmd}`);

    if (cmd === '/backup') {
        await sendTelegram('⏳ <b>Backup started...</b> This may take up to a minute.').catch(() => {});
        try {
            const result = await sendDailyBackup();
            if (!result.sent && !result.localWritten) {
                await sendTelegram(`❌ <b>Backup failed:</b> ${esc(result.error)}`).catch(() => {});
            }
        } catch (e) {
            await sendTelegram(`❌ <b>Backup error:</b> ${esc(e.message)}`).catch(() => {});
        }
    } else if (cmd === '/status') {
        await sendTodayStatus().catch(e =>
            sendTelegram(`❌ Status error: ${esc(e.message)}`).catch(() => {})
        );
    } else if (cmd === '/audit') {
        await sendTelegram('⏳ <b>Generating audit report...</b>').catch(() => {});
        await sendFullAuditReport().catch(e =>
            sendTelegram(`❌ Audit error: ${esc(e.message)}`).catch(() => {})
        );
    } else if (cmd === '/help') {
        await sendTelegram(
            `📱 <b>Dexter's Lab — Bot Commands</b>\n\n` +
            `/backup — Take database backup now\n` +
            `/status — Today's orders &amp; payments\n` +
            `/audit  — Full bill audit report\n` +
            `/help   — Show this message`
        ).catch(() => {});
    }
}

function startPolling() {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.log('[TELEGRAM] Polling skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
        return;
    }
    if (_pollingActive) return;
    _pollingActive = true;
    console.log('[TELEGRAM] Command polling started (every 5s)');

    const poll = async () => {
        if (!_pollingActive) return;
        try {
            const updates = await _getUpdates();
            for (const update of updates) {
                const msg = update.message;
                if (!msg || !msg.text) continue;
                // Only respond to the configured chat
                if (String(msg.chat.id) !== String(CHAT_ID)) {
                    console.warn(`[TELEGRAM] Ignoring update from unauthorized chat ${msg.chat.id}`);
                    continue;
                }
                if (msg.text.startsWith('/')) {
                    _handleCommand(msg.text).catch(e =>
                        console.error('[TELEGRAM] Command handler error:', e.message)
                    );
                }
            }
        } catch (e) {
            console.error('[TELEGRAM] Poll error:', e.message);
        }
        setTimeout(poll, 5000);
    };

    setTimeout(poll, 3000); // slight delay so DB is ready before first poll
}

function stopPolling() {
    _pollingActive = false;
    console.log('[TELEGRAM] Command polling stopped');
}

module.exports = {
    sendTelegram,
    sendTelegramDocument,
    esc,
    alertItemDeleted,
    alertBillDeleted,
    alertPaymentToggle,
    alertUnusedWeight,
    alertOrderCreated,
    sendDailySummary,
    sendFullAuditReport,
    sendDailyBackup,
    sendTodayStatus,
    startPolling,
    stopPolling
};
