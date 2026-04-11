/**
 * Scheduled Jobs — runs asynchronously, never blocks the main server.
 *
 * Jobs:
 *   • Daily Drift Check — 2:00 AM server time
 */

const cron = require('node-cron');
const LedgerService = require('./services/ledgerService');
const SelfAuditService = require('./services/selfAuditService');
const telegram = require('./services/telegramAlert');

let initialized = false;

function init(db) {
    if (initialized) return;
    initialized = true;

    const ledgerService = new LedgerService(db);
    const selfAuditService = new SelfAuditService(db);

    // ── Hourly Self-Audit (L3 Invariant Engine) ─────────────────────────────
    cron.schedule('0 * * * *', async () => {
        try {
            const report = await selfAuditService.run({ writeHistory: true, triggeredBy: 'scheduler' });
            const { overallStatus, sevCounts } = report.summary;

            if (overallStatus !== 'OK') {
                console.error(`[SCHEDULER] Self-audit ALERT: ${overallStatus} — ` +
                    `HALT=${sevCounts.HALT} ` +
                    `CRITICAL=${sevCounts.CRITICAL} ` +
                    `WARNING=${sevCounts.WARNING}`);
            }

            // Alert owner immediately via Telegram for HALT or CRITICAL.
            // WARNING is logged only — it does not block writes.
            if (overallStatus === 'HALT' || overallStatus === 'CRITICAL') {
                const failLines = report.results
                    .filter(r => r.status === 'FAIL')
                    .map(r => {
                        const detail = Array.isArray(r.detail)
                            ? r.detail.slice(0, 3).join('; ')
                            : r.detail;
                        return `• ${r.id} (${r.severity}): ${detail}`;
                    })
                    .join('\n');

                const blockedMsg = overallStatus === 'HALT'
                    ? '🔴 All financial writes are BLOCKED.'
                    : '🟠 Writes allowed but integrity issues found.';

                await telegram.sendTelegram(
                    `🚨 <b>FINANCIAL INTEGRITY ${overallStatus}</b>\n\n` +
                    `${blockedMsg}\n\n` +
                    `<b>Violations:</b>\n${failLines || 'See server logs'}\n\n` +
                    `<b>Action:</b> Log into the system and run the Data Integrity Audit to investigate.`
                ).catch(e => console.error('[SCHEDULER] Failed to send HALT alert via Telegram:', e.message));
            }
        } catch (err) {
            console.error(`[SCHEDULER] Self-audit failed: ${err.message}`);
        }
    });

    console.log('[SCHEDULER] Hourly self-audit (L3) registered — runs at :00 every hour');

    // ── Daily Drift Check — every day at 02:00 ──────────────
    cron.schedule('0 2 * * *', async () => {
        try {
            const report = await ledgerService.dailyDriftCheck();

            if (report.status === 'DRIFT_DETECTED') {
                console.log('╔══════════════════════════════════════════════════════╗');
                console.log('║  [LEDGER] DRIFT_DETECTED                            ║');
                console.log(`║  Timestamp : ${report.timestamp}       ║`);
                console.log(`║  Customers : ${String(report.customerDrift.length).padEnd(3)} drifted                              ║`);
                console.log(`║  Sales     : match=${report.systemTotals.sales.isMatched}  diff=${report.systemTotals.sales.difference}`);
                console.log(`║  Payments  : match=${report.systemTotals.payments.isMatched}  diff=${report.systemTotals.payments.difference}`);
                console.log('╚══════════════════════════════════════════════════════╝');

                for (const c of report.customerDrift) {
                    console.log(`  [DRIFT] ${c.customerName}: old=${c.oldOutstanding} ledger=${c.ledgerBalance} diff=${c.difference}`);
                }

                // ── Future email alert hook ──────────────────────
                // To enable, implement sendDriftAlert(report) and uncomment:
                // await sendDriftAlert(report);
            } else {
                console.log(`[LEDGER] Daily drift check OK at ${report.timestamp}`);
            }
        } catch (err) {
            console.error(`[LEDGER] Scheduled drift check failed: ${err.message}`);
        }
    });

    console.log('[SCHEDULER] Daily drift check registered — runs at 02:00 server time');

    // ── Daily Fraud Summary — every day at 21:00 IST (15:30 UTC) ──
    cron.schedule('30 15 * * *', async () => {
        try {
            console.log('[SCHEDULER] Running daily fraud summary...');
            await telegram.sendDailySummary();
        } catch (err) {
            console.error(`[SCHEDULER] Daily fraud summary failed: ${err.message}`);
        }
    });

    console.log('[SCHEDULER] Daily fraud summary registered — runs at 9:00 PM IST');

    // ── Nightly Database Backup — every day at 19:00 IST (13:30 UTC) ──
    cron.schedule('30 13 * * *', async () => {
        try {
            console.log('[SCHEDULER] Running nightly database backup...');
            await telegram.sendDailyBackup();
        } catch (err) {
            console.error(`[SCHEDULER] Nightly backup failed: ${err.message}`);
        }
    });

    console.log('[SCHEDULER] Nightly database backup registered — runs at 7:00 PM IST');
}

module.exports = { init };
