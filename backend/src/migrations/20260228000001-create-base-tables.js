'use strict';

/**
 * Create all base tables that were previously handled by sequelize.sync().
 * All operations are idempotent — safe to run on existing databases.
 *
 * Tables created here:
 *   audit_logs, customers, users, suppliers, payments,
 *   purchaseBills, purchaseItems, stocks, stock_transactions,
 *   hsn_codes, invoice_sequences, receipt_allocations,
 *   daily_expenses, daily_summaries
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const tableExists = async (name) => {
            const [rows] = await queryInterface.sequelize.query(
                `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '${name}')`
            );
            return rows[0].exists;
        };

        const indexExists = async (table, name) => {
            const [rows] = await queryInterface.sequelize.query(
                `SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = '${table}' AND indexname = '${name}')`
            );
            return rows[0].exists;
        };

        const addIndexSafe = async (table, columns, options = {}) => {
            const name = options.name || `${table}_${columns.join('_')}`;
            if (!(await indexExists(table, name))) {
                await queryInterface.addIndex(table, columns, options);
            }
        };

        // ── audit_logs ────────────────────────────────────────────────────────
        if (!(await tableExists('audit_logs'))) {
            await queryInterface.createTable('audit_logs', {
                id:          { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                userId:      { type: Sequelize.UUID, allowNull: true },
                userName:    { type: Sequelize.STRING, allowNull: true },
                userRole:    { type: Sequelize.STRING, allowNull: true },
                action: {
                    type: Sequelize.ENUM('CREATE','UPDATE','DELETE','RESTORE','LOGIN','LOGOUT',
                                         'LOGIN_FAILED','VIEW','ORDER_PAYMENT_STATUS','CONFIRM_LINK',
                                         'GST_EXPORT'),
                    allowNull: false
                },
                entityType:  { type: Sequelize.STRING, allowNull: false },
                entityId:    { type: Sequelize.STRING, allowNull: true },
                entityName:  { type: Sequelize.STRING, allowNull: true },
                oldValues:   { type: Sequelize.JSONB, allowNull: true },
                newValues:   { type: Sequelize.JSONB, allowNull: true },
                description: { type: Sequelize.TEXT, allowNull: true },
                ipAddress:   { type: Sequelize.STRING, allowNull: true },
                userAgent:   { type: Sequelize.STRING, allowNull: true },
                metadata:    { type: Sequelize.JSONB, allowNull: true },
                createdAt:   { type: Sequelize.DATE, allowNull: false },
                updatedAt:   { type: Sequelize.DATE, allowNull: false }
            });
            await addIndexSafe('audit_logs', ['userId'],     { name: 'idx_audit_logs_userId' });
            await addIndexSafe('audit_logs', ['action'],     { name: 'idx_audit_logs_action' });
            await addIndexSafe('audit_logs', ['entityType'], { name: 'idx_audit_logs_entityType' });
            await addIndexSafe('audit_logs', ['entityId'],   { name: 'idx_audit_logs_entityId' });
            await addIndexSafe('audit_logs', ['createdAt'],  { name: 'idx_audit_logs_createdAt' });
        }

        // ── customers ─────────────────────────────────────────────────────────
        if (!(await tableExists('customers'))) {
            await queryInterface.createTable('customers', {
                id:                 { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                name:               { type: Sequelize.STRING, allowNull: false },
                mobile:             { type: Sequelize.STRING },
                email:              { type: Sequelize.STRING },
                address:            { type: Sequelize.TEXT },
                gstin:              { type: Sequelize.STRING(20), allowNull: true },
                gstType: {
                    type: Sequelize.ENUM('REGISTERED','UNREGISTERED','CONSUMER','COMPOSITION'),
                    allowNull: false,
                    defaultValue: 'UNREGISTERED'
                },
                stateCode:          { type: Sequelize.STRING(5), allowNull: true },
                stateName:          { type: Sequelize.STRING(50), allowNull: true },
                panNumber:          { type: Sequelize.STRING(20), allowNull: true },
                openingBalance:     { type: Sequelize.DECIMAL(15,2), allowNull: false, defaultValue: 0 },
                openingBalanceDate: { type: Sequelize.DATEONLY, allowNull: true },
                currentBalance:     { type: Sequelize.DECIMAL(15,2), allowNull: false, defaultValue: 0 },
                creditLimit:        { type: Sequelize.DECIMAL(15,2), allowNull: false, defaultValue: 0 },
                creditDays:         { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
                notes:              { type: Sequelize.TEXT, allowNull: true },
                isActive:           { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
                createdAt:          { type: Sequelize.DATE, allowNull: false },
                updatedAt:          { type: Sequelize.DATE, allowNull: false }
            });
            await addIndexSafe('customers', ['mobile'],   { name: 'idx_customers_mobile' });
            await addIndexSafe('customers', ['gstin'],    { name: 'idx_customers_gstin' });
            await addIndexSafe('customers', ['isActive'], { name: 'idx_customers_isActive' });
        }

        // ── users ─────────────────────────────────────────────────────────────
        if (!(await tableExists('users'))) {
            await queryInterface.createTable('users', {
                id:        { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                username:  { type: Sequelize.STRING, allowNull: false, unique: true },
                password:  { type: Sequelize.STRING, allowNull: false },
                name:      { type: Sequelize.STRING, allowNull: false },
                email:     { type: Sequelize.STRING, allowNull: true },
                role: {
                    type: Sequelize.ENUM('admin','billing_staff'),
                    allowNull: false,
                    defaultValue: 'billing_staff'
                },
                isActive:  { type: Sequelize.BOOLEAN, defaultValue: true },
                lastLogin: { type: Sequelize.DATE, allowNull: true },
                isDeleted: { type: Sequelize.BOOLEAN, defaultValue: false },
                deletedAt: { type: Sequelize.DATE, allowNull: true },
                deletedBy: { type: Sequelize.UUID, allowNull: true },
                createdAt: { type: Sequelize.DATE, allowNull: false },
                updatedAt: { type: Sequelize.DATE, allowNull: false }
            });
        }

        // ── suppliers ─────────────────────────────────────────────────────────
        if (!(await tableExists('suppliers'))) {
            await queryInterface.createTable('suppliers', {
                id:             { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                name:           { type: Sequelize.STRING, allowNull: false },
                mobile:         { type: Sequelize.STRING },
                email:          { type: Sequelize.STRING },
                address:        { type: Sequelize.TEXT },
                gstin:          { type: Sequelize.STRING },
                openingBalance: { type: Sequelize.DECIMAL(15,2) },
                currentBalance: { type: Sequelize.DECIMAL(15,2) },
                createdAt:      { type: Sequelize.DATE, allowNull: false },
                updatedAt:      { type: Sequelize.DATE, allowNull: false }
            });
        }

        // ── payments ──────────────────────────────────────────────────────────
        if (!(await tableExists('payments'))) {
            await queryInterface.createTable('payments', {
                id:              { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                paymentNumber:   { type: Sequelize.STRING, unique: true, allowNull: false },
                paymentDate:     { type: Sequelize.STRING, allowNull: false },
                partyId:         { type: Sequelize.UUID, allowNull: true },
                partyName:       { type: Sequelize.STRING, allowNull: false },
                partyType: {
                    type: Sequelize.ENUM('customer','supplier','expense'),
                    allowNull: false
                },
                amount:          { type: Sequelize.DECIMAL(15,2), allowNull: false },
                referenceType: {
                    type: Sequelize.ENUM('order','purchase','advance'),
                    allowNull: false
                },
                referenceId:     { type: Sequelize.UUID, allowNull: true },
                referenceNumber: { type: Sequelize.STRING, allowNull: true },
                idempotencyKey:  { type: Sequelize.STRING, allowNull: true, unique: true },
                notes:           { type: Sequelize.TEXT },
                isDeleted:       { type: Sequelize.BOOLEAN, defaultValue: false },
                deletedAt:       { type: Sequelize.DATE, allowNull: true },
                deletedBy:       { type: Sequelize.UUID, allowNull: true },
                deletedByName:   { type: Sequelize.STRING, allowNull: true },
                createdAt:       { type: Sequelize.DATE, allowNull: false },
                updatedAt:       { type: Sequelize.DATE, allowNull: false }
            });
        }

        // ── purchaseBills ─────────────────────────────────────────────────────
        if (!(await tableExists('purchaseBills'))) {
            await queryInterface.createTable('purchaseBills', {
                id:            { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                billNumber:    { type: Sequelize.STRING, unique: true, allowNull: false },
                billDate:      { type: Sequelize.STRING, allowNull: false },
                supplierId:    { type: Sequelize.UUID, allowNull: false },
                subTotal:      { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                tax:           { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                taxPercent:    { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                total:         { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                paidAmount:    { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                dueAmount:     { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                paymentStatus: {
                    type: Sequelize.ENUM('paid','partial','unpaid'),
                    defaultValue: 'unpaid'
                },
                isDeleted:     { type: Sequelize.BOOLEAN, defaultValue: false },
                deletedAt:     { type: Sequelize.DATE, allowNull: true },
                deletedBy:     { type: Sequelize.UUID, allowNull: true },
                deletedByName: { type: Sequelize.STRING, allowNull: true },
                createdAt:     { type: Sequelize.DATE, allowNull: false },
                updatedAt:     { type: Sequelize.DATE, allowNull: false }
            });
        }

        // ── purchaseItems ─────────────────────────────────────────────────────
        if (!(await tableExists('purchaseItems'))) {
            await queryInterface.createTable('purchaseItems', {
                id:             { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                purchaseBillId: { type: Sequelize.UUID, allowNull: false },
                name:           { type: Sequelize.TEXT, allowNull: false },
                quantity:       { type: Sequelize.DECIMAL(15,2), allowNull: false },
                price:          { type: Sequelize.DECIMAL(15,2), allowNull: false },
                totalPrice:     { type: Sequelize.DECIMAL(15,2), allowNull: false },
                type:           { type: Sequelize.ENUM('WEIGHTED','NON_WEIGHTED','DZN'), allowNull: true },
                createdAt:      { type: Sequelize.DATE, allowNull: false },
                updatedAt:      { type: Sequelize.DATE, allowNull: false }
            });
        }

        // ── stocks ────────────────────────────────────────────────────────────
        if (!(await tableExists('stocks'))) {
            await queryInterface.createTable('stocks', {
                id:            { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                productId:     { type: Sequelize.UUID, allowNull: false },
                currentStock:  { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                minStockLevel: { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                unit:          { type: Sequelize.STRING, defaultValue: 'kg' },
                lastUpdated:   { type: Sequelize.DATE },
                createdAt:     { type: Sequelize.DATE, allowNull: false },
                updatedAt:     { type: Sequelize.DATE, allowNull: false }
            });
        }

        // ── stock_transactions ────────────────────────────────────────────────
        if (!(await tableExists('stock_transactions'))) {
            await queryInterface.createTable('stock_transactions', {
                id:              { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                productId:       { type: Sequelize.UUID, allowNull: false },
                type:            { type: Sequelize.ENUM('in','out','adjustment'), allowNull: false },
                quantity:        { type: Sequelize.DECIMAL(15,2), allowNull: false },
                previousStock:   { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                newStock:        { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                referenceType:   { type: Sequelize.STRING, allowNull: true },
                referenceId:     { type: Sequelize.UUID, allowNull: true },
                notes:           { type: Sequelize.TEXT, allowNull: true },
                transactionDate: { type: Sequelize.DATEONLY, allowNull: false },
                createdBy:       { type: Sequelize.UUID, allowNull: true },
                createdByName:   { type: Sequelize.STRING, allowNull: true },
                createdAt:       { type: Sequelize.DATE, allowNull: false },
                updatedAt:       { type: Sequelize.DATE, allowNull: false }
            });
        }

        // ── hsn_codes ─────────────────────────────────────────────────────────
        if (!(await tableExists('hsn_codes'))) {
            await queryInterface.createTable('hsn_codes', {
                id:          { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                code:        { type: Sequelize.STRING(20), allowNull: false, unique: true },
                description: { type: Sequelize.TEXT, allowNull: true },
                gstRate:     { type: Sequelize.DECIMAL(5,2), defaultValue: 0 },
                cgstRate:    { type: Sequelize.DECIMAL(5,2), defaultValue: 0 },
                sgstRate:    { type: Sequelize.DECIMAL(5,2), defaultValue: 0 },
                igstRate:    { type: Sequelize.DECIMAL(5,2), defaultValue: 0 },
                cessRate:    { type: Sequelize.DECIMAL(5,2), defaultValue: 0 },
                type:        { type: Sequelize.ENUM('GOODS','SERVICES'), defaultValue: 'GOODS' },
                isActive:    { type: Sequelize.BOOLEAN, defaultValue: true },
                createdAt:   { type: Sequelize.DATE, allowNull: false },
                updatedAt:   { type: Sequelize.DATE, allowNull: false }
            });
        }

        // ── invoice_sequences ─────────────────────────────────────────────────
        if (!(await tableExists('invoice_sequences'))) {
            await queryInterface.createTable('invoice_sequences', {
                id:                { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                prefix:            { type: Sequelize.STRING, defaultValue: 'INV' },
                currentNumber:     { type: Sequelize.INTEGER, defaultValue: 0 },
                lastDate:          { type: Sequelize.DATEONLY, allowNull: true },
                dailyNumber:       { type: Sequelize.INTEGER, defaultValue: 0 },
                lastFinancialYear: { type: Sequelize.STRING, allowNull: true },
                createdAt:         { type: Sequelize.DATE, allowNull: false },
                updatedAt:         { type: Sequelize.DATE, allowNull: false }
            });
        }

        // ── receipt_allocations ───────────────────────────────────────────────
        if (!(await tableExists('receipt_allocations'))) {
            await queryInterface.createTable('receipt_allocations', {
                id:              { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                paymentId:       { type: Sequelize.UUID, allowNull: false },
                orderId:         { type: Sequelize.UUID, allowNull: false },
                amount:          { type: Sequelize.DECIMAL(15,2), allowNull: false },
                allocatedBy:     { type: Sequelize.UUID, allowNull: true },
                allocatedByName: { type: Sequelize.STRING, allowNull: true },
                notes:           { type: Sequelize.STRING(255), allowNull: true },
                isDeleted:       { type: Sequelize.BOOLEAN, defaultValue: false },
                createdAt:       { type: Sequelize.DATE, allowNull: false },
                updatedAt:       { type: Sequelize.DATE, allowNull: false }
            });
            await addIndexSafe('receipt_allocations', ['paymentId'], { name: 'idx_ra_paymentId' });
            await addIndexSafe('receipt_allocations', ['orderId'],   { name: 'idx_ra_orderId' });
        }

        // ── daily_expenses ────────────────────────────────────────────────────
        if (!(await tableExists('daily_expenses'))) {
            await queryInterface.createTable('daily_expenses', {
                id:            { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                date:          { type: Sequelize.DATEONLY, allowNull: false },
                category:      { type: Sequelize.STRING, allowNull: false },
                description:   { type: Sequelize.STRING, allowNull: true },
                amount:        { type: Sequelize.DECIMAL(15,2), allowNull: false },
                paidTo:        { type: Sequelize.STRING, allowNull: true },
                paymentMode: {
                    type: Sequelize.ENUM('cash','upi','bank','other'),
                    defaultValue: 'cash'
                },
                createdBy:     { type: Sequelize.UUID, allowNull: true },
                createdByName: { type: Sequelize.STRING, allowNull: true },
                createdAt:     { type: Sequelize.DATE, allowNull: false },
                updatedAt:     { type: Sequelize.DATE, allowNull: false }
            });
            await addIndexSafe('daily_expenses', ['date'],     { name: 'idx_daily_expenses_date' });
            await addIndexSafe('daily_expenses', ['category'], { name: 'idx_daily_expenses_category' });
        }

        // ── daily_summaries ───────────────────────────────────────────────────
        if (!(await tableExists('daily_summaries'))) {
            await queryInterface.createTable('daily_summaries', {
                id:                     { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.UUIDV4 },
                date:                   { type: Sequelize.DATEONLY, allowNull: false, unique: true },
                openingBalance:         { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                openingBalanceSetAt:    { type: Sequelize.DATE, allowNull: true },
                openingBalanceSetBy:    { type: Sequelize.STRING, allowNull: true },
                totalSales:             { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                totalOrders:            { type: Sequelize.INTEGER, defaultValue: 0 },
                totalPurchases:         { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                totalPaymentsReceived:  { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                totalPaymentsMade:      { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                lastInvoiceNumber:      { type: Sequelize.INTEGER, defaultValue: 0 },
                orderIds:               { type: Sequelize.JSONB, defaultValue: [] },
                isClosed:               { type: Sequelize.BOOLEAN, defaultValue: false },
                closedAt:               { type: Sequelize.DATE, allowNull: true },
                closedBy:               { type: Sequelize.UUID, allowNull: true },
                closingBalance:         { type: Sequelize.DECIMAL(15,2), defaultValue: 0 },
                createdAt:              { type: Sequelize.DATE, allowNull: false },
                updatedAt:              { type: Sequelize.DATE, allowNull: false }
            });
        }

        console.log('[MIGRATION] Base tables created successfully.');
    },

    down: async (queryInterface) => {
        const tables = [
            'daily_summaries', 'daily_expenses', 'receipt_allocations',
            'invoice_sequences', 'hsn_codes', 'stock_transactions', 'stocks',
            'purchaseItems', 'purchaseBills', 'payments', 'suppliers',
            'users', 'customers', 'audit_logs'
        ];
        for (const t of tables) {
            await queryInterface.dropTable(t).catch(() => {});
        }
    }
};
