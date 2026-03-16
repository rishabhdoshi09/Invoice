const db = require('../models');
const { authenticate } = require('../middleware/auth');

module.exports = (router) => {
    /**
     * GET /api/audit-trail
     * One-click full audit trail with filters.
     * Query params: action, entityType, userName, from, to, limit, offset, search
     */
    router.get('/audit-trail', authenticate, async (req, res) => {
        try {
            const { action, entityType, userName, from, to, search, limit = 100, offset = 0 } = req.query;

            const conditions = [];
            const replacements = {};

            if (action) {
                conditions.push(`a.action = :action`);
                replacements.action = action;
            }
            if (entityType) {
                conditions.push(`a."entityType" = :entityType`);
                replacements.entityType = entityType;
            }
            if (userName) {
                conditions.push(`LOWER(a."userName") LIKE LOWER(:userName)`);
                replacements.userName = `%${userName}%`;
            }
            if (from) {
                conditions.push(`a."createdAt" >= :from`);
                replacements.from = from;
            }
            if (to) {
                conditions.push(`a."createdAt" < :to::date + interval '1 day'`);
                replacements.to = to;
            }
            if (search) {
                conditions.push(`(
                    LOWER(a.description) LIKE LOWER(:search)
                    OR LOWER(a."entityName") LIKE LOWER(:search)
                    OR LOWER(a."userName") LIKE LOWER(:search)
                )`);
                replacements.search = `%${search}%`;
            }

            const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            // Count
            const [countResult] = await db.sequelize.query(
                `SELECT COUNT(*) as total FROM audit_logs a ${where}`,
                { replacements }
            );
            const total = Number(countResult[0].total);

            // Fetch
            const [rows] = await db.sequelize.query(`
                SELECT a.id, a.action, a."entityType", a."entityId", a."entityName",
                       a."userName", a."userRole", a.description,
                       a."oldValues", a."newValues",
                       a."ipAddress", a."createdAt"
                FROM audit_logs a
                ${where}
                ORDER BY a."createdAt" DESC
                LIMIT :limit OFFSET :offset
            `, { replacements: { ...replacements, limit: Number(limit), offset: Number(offset) } });

            // Summary counts by action type
            const [summary] = await db.sequelize.query(`
                SELECT action, "entityType", COUNT(*) as count
                FROM audit_logs a ${where}
                GROUP BY action, "entityType"
                ORDER BY count DESC
            `, { replacements });

            return res.status(200).json({
                status: 200,
                data: { rows, total, summary, limit: Number(limit), offset: Number(offset) }
            });
        } catch (error) {
            console.error('Audit trail error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    });
};
