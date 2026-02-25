/**
 * Scheduled Jobs — runs asynchronously, never blocks the main server.
 *
 * Jobs:
 *   • Daily Drift Check — 2:00 AM server time
 */

const cron = require('node-cron');
const LedgerService = require('./services/ledgerService');

let initialized = false;

function init(db) {
    if (initialized) return;
    initialized = true;

    const ledgerService = new LedgerService(db);

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
}

module.exports = { init };
