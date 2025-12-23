const db = require('../models');
const { Op } = require('sequelize');
const moment = require('moment-timezone');

module.exports = {
    // Get audit logs with filters
    getAuditLogs: async (filters = {}) => {
        const where = {};
        
        if (filters.userId) {
            where.userId = filters.userId;
        }
        
        if (filters.action) {
            where.action = filters.action;
        }
        
        if (filters.entityType) {
            where.entityType = filters.entityType;
        }
        
        if (filters.entityId) {
            where.entityId = filters.entityId;
        }
        
        if (filters.startDate && filters.endDate) {
            where.createdAt = {
                [Op.between]: [
                    moment(filters.startDate).startOf('day').toDate(),
                    moment(filters.endDate).endOf('day').toDate()
                ]
            };
        } else if (filters.startDate) {
            where.createdAt = {
                [Op.gte]: moment(filters.startDate).startOf('day').toDate()
            };
        } else if (filters.endDate) {
            where.createdAt = {
                [Op.lte]: moment(filters.endDate).endOf('day').toDate()
            };
        }
        
        const logs = await db.auditLog.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: filters.limit || 100,
            offset: filters.offset || 0
        });
        
        return logs;
    },

    // Get audit log for specific entity
    getEntityHistory: async (entityType, entityId) => {
        const logs = await db.auditLog.findAll({
            where: {
                entityType,
                entityId: String(entityId)
            },
            order: [['createdAt', 'DESC']]
        });
        
        return logs;
    },

    // Get user activity summary
    getUserActivity: async (userId, days = 7) => {
        const startDate = moment().subtract(days, 'days').startOf('day').toDate();
        
        const logs = await db.auditLog.findAll({
            where: {
                userId,
                createdAt: {
                    [Op.gte]: startDate
                }
            },
            order: [['createdAt', 'DESC']]
        });
        
        // Group by action type
        const summary = {
            total: logs.length,
            byAction: {},
            byEntityType: {},
            recentActions: logs.slice(0, 20)
        };
        
        logs.forEach(log => {
            summary.byAction[log.action] = (summary.byAction[log.action] || 0) + 1;
            summary.byEntityType[log.entityType] = (summary.byEntityType[log.entityType] || 0) + 1;
        });
        
        return summary;
    },

    // Get recent deletions (for admin review)
    getRecentDeletions: async (days = 30) => {
        const startDate = moment().subtract(days, 'days').startOf('day').toDate();
        
        const logs = await db.auditLog.findAll({
            where: {
                action: 'DELETE',
                createdAt: {
                    [Op.gte]: startDate
                }
            },
            order: [['createdAt', 'DESC']]
        });
        
        return logs;
    },

    // Get suspicious activities (multiple deletions, etc.)
    getSuspiciousActivity: async () => {
        const last24h = moment().subtract(24, 'hours').toDate();
        
        // Get all deletions in last 24 hours grouped by user
        const deletions = await db.auditLog.findAll({
            where: {
                action: 'DELETE',
                createdAt: {
                    [Op.gte]: last24h
                }
            },
            attributes: [
                'userId',
                'userName',
                [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'deleteCount']
            ],
            group: ['userId', 'userName'],
            having: db.Sequelize.literal('COUNT(id) >= 3'), // Flag if 3+ deletions
            raw: true
        });
        
        // Get failed login attempts
        const failedLogins = await db.auditLog.findAll({
            where: {
                action: 'LOGIN_FAILED',
                createdAt: {
                    [Op.gte]: last24h
                }
            },
            order: [['createdAt', 'DESC']]
        });
        
        return {
            highDeletionUsers: deletions,
            failedLogins,
            alerts: [
                ...deletions.map(d => ({
                    type: 'HIGH_DELETIONS',
                    message: `User ${d.userName} deleted ${d.deleteCount} records in the last 24 hours`,
                    userId: d.userId
                })),
                ...(failedLogins.length >= 5 ? [{
                    type: 'MULTIPLE_FAILED_LOGINS',
                    message: `${failedLogins.length} failed login attempts in the last 24 hours`,
                    count: failedLogins.length
                }] : [])
            ]
        };
    },

    // Dashboard stats
    getDashboardStats: async () => {
        const today = moment().startOf('day').toDate();
        const thisWeek = moment().subtract(7, 'days').startOf('day').toDate();
        
        // Today's activity
        const todayLogs = await db.auditLog.count({
            where: {
                createdAt: { [Op.gte]: today }
            }
        });
        
        // This week's activity by type
        const weeklyByAction = await db.auditLog.findAll({
            where: {
                createdAt: { [Op.gte]: thisWeek }
            },
            attributes: [
                'action',
                [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'count']
            ],
            group: ['action'],
            raw: true
        });
        
        // Active users today
        const activeUsersToday = await db.auditLog.findAll({
            where: {
                createdAt: { [Op.gte]: today },
                userId: { [Op.ne]: null }
            },
            attributes: [
                [db.Sequelize.fn('DISTINCT', db.Sequelize.col('userId')), 'userId']
            ],
            raw: true
        });
        
        return {
            todayActivityCount: todayLogs,
            weeklyByAction: weeklyByAction.reduce((acc, row) => {
                acc[row.action] = parseInt(row.count);
                return acc;
            }, {}),
            activeUsersToday: activeUsersToday.length
        };
    }
};
