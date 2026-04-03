'use strict';

module.exports = {
    up: async (queryInterface) => {
        // Guard: enum type only exists after audit_logs table is created
        // (20260227000001-consolidated-schema-update). Skip safely on fresh installs.
        const [rows] = await queryInterface.sequelize.query(
            `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_audit_logs_action')`
        );
        if (!rows[0].exists) return;

        await queryInterface.sequelize.query(
            "ALTER TYPE \"enum_audit_logs_action\" ADD VALUE IF NOT EXISTS 'ORDER_PAYMENT_STATUS';"
        );
        await queryInterface.sequelize.query(
            "ALTER TYPE \"enum_audit_logs_action\" ADD VALUE IF NOT EXISTS 'CONFIRM_LINK';"
        );
    },
    down: async () => {
        // Removing enum values in PostgreSQL is complex and unnecessary for rollback
    }
};
