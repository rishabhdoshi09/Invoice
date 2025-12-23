const db = require('../models');
const uuidv4 = require('uuid/v4');

// Helper to get client IP
const getClientIP = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           'unknown';
};

// Create an audit log entry
const createAuditLog = async ({
    userId,
    userName,
    userRole,
    action,
    entityType,
    entityId,
    entityName,
    oldValues,
    newValues,
    description,
    ipAddress,
    userAgent,
    metadata
}) => {
    try {
        const log = await db.auditLog.create({
            id: uuidv4(),
            userId,
            userName,
            userRole,
            action,
            entityType,
            entityId: entityId ? String(entityId) : null,
            entityName,
            oldValues: oldValues || null,
            newValues: newValues || null,
            description,
            ipAddress,
            userAgent,
            metadata
        });
        return log;
    } catch (error) {
        console.error('Failed to create audit log:', error);
        // Don't throw - audit logging should not break the main operation
        return null;
    }
};

// Middleware to automatically log actions
const auditMiddleware = (entityType, actionOverride = null) => {
    return async (req, res, next) => {
        // Store original json method
        const originalJson = res.json.bind(res);
        
        // Get action from method or override
        let action = actionOverride;
        if (!action) {
            switch (req.method) {
                case 'POST': action = 'CREATE'; break;
                case 'PUT':
                case 'PATCH': action = 'UPDATE'; break;
                case 'DELETE': action = 'DELETE'; break;
                default: action = 'VIEW'; break;
            }
        }

        // Capture request body for audit
        const requestBody = { ...req.body };
        // Remove sensitive fields
        delete requestBody.password;
        delete requestBody.token;

        // Override json to capture response
        res.json = async function(data) {
            try {
                // Only log successful operations (2xx status)
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    const entityId = req.params.id || 
                                    req.params.orderId || 
                                    req.params.supplierId || 
                                    req.params.customerId ||
                                    req.params.productId ||
                                    req.params.paymentId ||
                                    req.params.purchaseId ||
                                    data?.data?.id;

                    const entityName = data?.data?.orderNumber ||
                                      data?.data?.name ||
                                      data?.data?.customerName ||
                                      null;

                    await createAuditLog({
                        userId: req.user?.id || null,
                        userName: req.user?.name || req.user?.username || 'Anonymous',
                        userRole: req.user?.role || 'unknown',
                        action,
                        entityType,
                        entityId,
                        entityName,
                        oldValues: req.originalEntity || null,
                        newValues: action !== 'DELETE' ? requestBody : null,
                        description: `${action} ${entityType}${entityName ? ': ' + entityName : ''}`,
                        ipAddress: getClientIP(req),
                        userAgent: req.headers['user-agent'],
                        metadata: {
                            method: req.method,
                            path: req.path,
                            statusCode: res.statusCode
                        }
                    });
                }
            } catch (err) {
                console.error('Audit middleware error:', err);
            }

            return originalJson(data);
        };

        next();
    };
};

// Log authentication events
const logAuthEvent = async (req, action, userId, userName, success, details = {}) => {
    await createAuditLog({
        userId,
        userName,
        userRole: details.role || 'unknown',
        action,
        entityType: 'AUTH',
        entityId: userId,
        entityName: userName,
        description: `${action}: ${success ? 'Success' : 'Failed'}${details.reason ? ' - ' + details.reason : ''}`,
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        metadata: details
    });
};

// Fetch original entity before update/delete for comparison
const captureOriginal = (model, idParam) => {
    return async (req, res, next) => {
        try {
            const id = req.params[idParam];
            if (id && (req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE')) {
                const original = await model.findOne({ where: { id } });
                if (original) {
                    req.originalEntity = original.toJSON();
                    // Remove sensitive data
                    delete req.originalEntity.password;
                }
            }
        } catch (error) {
            console.error('Capture original error:', error);
        }
        next();
    };
};

module.exports = {
    createAuditLog,
    auditMiddleware,
    logAuthEvent,
    captureOriginal,
    getClientIP
};
