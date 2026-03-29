const db = require('../models');
const SelfAuditService = require('../services/selfAuditService');

const auditService = new SelfAuditService(db);

/**
 * POST /self-audit/run
 * Trigger an on-demand audit run (admin only).
 */
const runAudit = async (req, res) => {
    try {
        const report = await auditService.run({
            writeHistory: true,
            triggeredBy: `api:${req.user?.userName || 'unknown'}`
        });
        return res.status(200).json({
            success: true,
            data: report
        });
    } catch (err) {
        console.error('[SELF-AUDIT] On-demand run failed:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /self-audit/history
 * Return last N reconciliation run records (admin only).
 */
const getHistory = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = parseInt(req.query.offset) || 0;

        const rows = await db.sequelize.query(`
            SELECT id, "triggeredBy", "startedAt", "finishedAt", "durationMs",
                   "overallStatus", "passCount", "failCount", "criticalCount",
                   "haltCount", "warningCount", "errorCount"
            FROM reconciliation_runs
            ORDER BY "startedAt" DESC
            LIMIT :limit OFFSET :offset
        `, {
            replacements: { limit, offset },
            type: db.Sequelize.QueryTypes.SELECT
        });

        const [countResult] = await db.sequelize.query(
            `SELECT COUNT(*) AS total FROM reconciliation_runs`,
            { type: db.Sequelize.QueryTypes.SELECT }
        );

        return res.status(200).json({
            success: true,
            data: { rows, total: parseInt(countResult.total), limit, offset }
        });
    } catch (err) {
        console.error('[SELF-AUDIT] History fetch failed:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * GET /self-audit/history/:id
 * Return full details of a single reconciliation run (including results array).
 */
const getRunDetail = async (req, res) => {
    try {
        const [row] = await db.sequelize.query(`
            SELECT * FROM reconciliation_runs WHERE id = :id LIMIT 1
        `, {
            replacements: { id: req.params.id },
            type: db.Sequelize.QueryTypes.SELECT
        });

        if (!row) {
            return res.status(404).json({ success: false, message: 'Run not found' });
        }
        return res.status(200).json({ success: true, data: row });
    } catch (err) {
        console.error('[SELF-AUDIT] Run detail fetch failed:', err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { runAudit, getHistory, getRunDetail };
