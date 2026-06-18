'use strict';

/**
 * Patch bill_audit_logs to match the current model definition.
 *
 * The original CREATE TABLE in 20260227 only had:
 *   id, eventType, user, details, invoiceContext, createdAt, updatedAt
 *
 * The model now expects:
 *   userId, userName, orderId, productName, quantity, price, totalPrice,
 *   billSnapshot, billTotal, customerName, deviceInfo
 *   (invoiceContext changed from JSONB → STRING)
 *
 * All additions are idempotent via describeTable checks.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        const cols = await queryInterface.describeTable('bill_audit_logs');

        const toAdd = [
            ['userId',       { type: Sequelize.UUID,           allowNull: true }],
            ['userName',     { type: Sequelize.STRING,         allowNull: true }],
            ['orderId',      { type: Sequelize.UUID,           allowNull: true }],
            ['productName',  { type: Sequelize.STRING,         allowNull: true }],
            ['quantity',     { type: Sequelize.DECIMAL(10, 3), allowNull: true }],
            ['price',        { type: Sequelize.DECIMAL(10, 2), allowNull: true }],
            ['totalPrice',   { type: Sequelize.DECIMAL(10, 2), allowNull: true }],
            ['billSnapshot', { type: Sequelize.JSONB,          allowNull: true }],
            ['billTotal',    { type: Sequelize.DECIMAL(10, 2), allowNull: true }],
            ['customerName', { type: Sequelize.STRING,         allowNull: true }],
            ['deviceInfo',   { type: Sequelize.STRING,         allowNull: true }],
        ];

        for (const [col, def] of toAdd) {
            if (!cols[col]) {
                await queryInterface.addColumn('bill_audit_logs', col, def);
            }
        }
    },

    async down(queryInterface) {
        const cols = await queryInterface.describeTable('bill_audit_logs');
        const added = ['userId','userName','orderId','productName','quantity',
                       'price','totalPrice','billSnapshot','billTotal','customerName','deviceInfo'];
        for (const col of added) {
            if (cols[col]) await queryInterface.removeColumn('bill_audit_logs', col);
        }
    }
};
