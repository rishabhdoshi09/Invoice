'use strict';

module.exports = {
    up: async (queryInterface) => {
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
