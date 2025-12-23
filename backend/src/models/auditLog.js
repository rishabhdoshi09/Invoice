module.exports = (sequelize, Sequelize) => {
    const auditLog = sequelize.define(
        'audit_logs',
        {
            id: {
                type: Sequelize.UUID,
                primaryKey: true,
                unique: true,
                defaultValue: Sequelize.UUIDV4
            },
            // Who performed the action
            userId: {
                type: Sequelize.UUID,
                allowNull: true // null for system actions or pre-auth actions
            },
            userName: {
                type: Sequelize.STRING,
                allowNull: true
            },
            userRole: {
                type: Sequelize.STRING,
                allowNull: true
            },
            // What action was performed
            action: {
                type: Sequelize.ENUM('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'VIEW'),
                allowNull: false
            },
            // What entity was affected
            entityType: {
                type: Sequelize.STRING,
                allowNull: false
            },
            entityId: {
                type: Sequelize.STRING,
                allowNull: true
            },
            entityName: {
                type: Sequelize.STRING,
                allowNull: true // e.g., order number, customer name
            },
            // Before and after values for changes
            oldValues: {
                type: Sequelize.JSONB,
                allowNull: true
            },
            newValues: {
                type: Sequelize.JSONB,
                allowNull: true
            },
            // Additional context
            description: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            ipAddress: {
                type: Sequelize.STRING,
                allowNull: true
            },
            userAgent: {
                type: Sequelize.STRING,
                allowNull: true
            },
            // Metadata
            metadata: {
                type: Sequelize.JSONB,
                allowNull: true
            }
        },
        {
            indexes: [
                { fields: ['userId'] },
                { fields: ['action'] },
                { fields: ['entityType'] },
                { fields: ['entityId'] },
                { fields: ['createdAt'] }
            ]
        }
    );

    return auditLog;
};
