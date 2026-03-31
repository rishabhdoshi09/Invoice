'use strict';

/**
 * Tally Feature Set Migration
 * Adds: GST engine, HSN codes, bank accounts, voucher types,
 *       cost centers, credit limits, enhanced product fields,
 *       debit notes, credit notes, journal vouchers
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {

        // ═══════════════════════════════════════════════════════
        //  1. HSN / SAC CODE MASTER
        // ═══════════════════════════════════════════════════════
        await queryInterface.createTable('hsn_codes', {
            id:          { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
            code:        { type: Sequelize.STRING(20), allowNull: false, unique: true },
            description: { type: Sequelize.TEXT, allowNull: true },
            gstRate:     { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
            cgstRate:    { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
            sgstRate:    { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
            igstRate:    { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
            cessRate:    { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
            type:        { type: Sequelize.ENUM('GOODS', 'SERVICES'), defaultValue: 'GOODS' },
            isActive:    { type: Sequelize.BOOLEAN, defaultValue: true },
            createdAt:   { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
            updatedAt:   { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
        });

        // ═══════════════════════════════════════════════════════
        //  2. BANK ACCOUNTS
        // ═══════════════════════════════════════════════════════
        await queryInterface.createTable('bank_accounts', {
            id:              { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
            name:            { type: Sequelize.STRING(100), allowNull: false },
            bankName:        { type: Sequelize.STRING(100), allowNull: true },
            accountNumber:   { type: Sequelize.STRING(50), allowNull: true },
            ifscCode:        { type: Sequelize.STRING(20), allowNull: true },
            branchName:      { type: Sequelize.STRING(100), allowNull: true },
            accountType:     { type: Sequelize.ENUM('CURRENT', 'SAVINGS', 'CASH', 'UPI'), defaultValue: 'CURRENT' },
            openingBalance:  { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            currentBalance:  { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            isActive:        { type: Sequelize.BOOLEAN, defaultValue: true },
            isDefault:       { type: Sequelize.BOOLEAN, defaultValue: false },
            notes:           { type: Sequelize.TEXT, allowNull: true },
            createdAt:       { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
            updatedAt:       { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
        });

        // ═══════════════════════════════════════════════════════
        //  3. VOUCHER TYPES
        // ═══════════════════════════════════════════════════════
        await queryInterface.createTable('voucher_types', {
            id:            { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
            name:          { type: Sequelize.STRING(50), allowNull: false, unique: true },
            type:          { type: Sequelize.ENUM('SALES','PURCHASE','RECEIPT','PAYMENT','JOURNAL','CONTRA','DEBIT_NOTE','CREDIT_NOTE'), allowNull: false },
            prefix:        { type: Sequelize.STRING(20), defaultValue: '' },
            lastNumber:    { type: Sequelize.INTEGER, defaultValue: 0 },
            isActive:      { type: Sequelize.BOOLEAN, defaultValue: true },
            affectsStock:  { type: Sequelize.BOOLEAN, defaultValue: false },
            createdAt:     { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
            updatedAt:     { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
        });

        // ═══════════════════════════════════════════════════════
        //  4. COST CENTERS
        // ═══════════════════════════════════════════════════════
        await queryInterface.createTable('cost_centers', {
            id:          { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
            name:        { type: Sequelize.STRING(100), allowNull: false },
            parentId:    { type: Sequelize.UUID, allowNull: true },
            description: { type: Sequelize.TEXT, allowNull: true },
            isActive:    { type: Sequelize.BOOLEAN, defaultValue: true },
            createdAt:   { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
            updatedAt:   { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
        });

        // ═══════════════════════════════════════════════════════
        //  5. BANK STATEMENT LINES (for bank reconciliation)
        // ═══════════════════════════════════════════════════════
        await queryInterface.createTable('bank_statement_lines', {
            id:              { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
            bankAccountId:   { type: Sequelize.UUID, allowNull: false },
            txnDate:         { type: Sequelize.DATEONLY, allowNull: false },
            description:     { type: Sequelize.TEXT, allowNull: true },
            debit:           { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            credit:          { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            balance:         { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            referenceNo:     { type: Sequelize.STRING(100), allowNull: true },
            isMatched:       { type: Sequelize.BOOLEAN, defaultValue: false },
            matchedPaymentId:{ type: Sequelize.UUID, allowNull: true },
            matchedAt:       { type: Sequelize.DATE, allowNull: true },
            createdAt:       { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
            updatedAt:       { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
        });
        await queryInterface.addIndex('bank_statement_lines', ['bankAccountId', 'txnDate'], { name: 'idx_bsl_account_date' });
        await queryInterface.addIndex('bank_statement_lines', ['isMatched'], { name: 'idx_bsl_matched' });

        // ═══════════════════════════════════════════════════════
        //  6. DEBIT NOTES (Sales Returns / Expense Increase)
        // ═══════════════════════════════════════════════════════
        await queryInterface.createTable('debit_notes', {
            id:              { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
            noteNumber:      { type: Sequelize.STRING(50), allowNull: false, unique: true },
            noteDate:        { type: Sequelize.DATEONLY, allowNull: false },
            partyId:         { type: Sequelize.UUID, allowNull: true },
            partyName:       { type: Sequelize.STRING(200), allowNull: true },
            partyType:       { type: Sequelize.ENUM('customer', 'supplier'), defaultValue: 'supplier' },
            againstOrderId:  { type: Sequelize.UUID, allowNull: true },
            againstBillId:   { type: Sequelize.UUID, allowNull: true },
            reason:          { type: Sequelize.TEXT, allowNull: true },
            subTotal:        { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            cgst:            { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            sgst:            { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            igst:            { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            total:           { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            status:          { type: Sequelize.ENUM('DRAFT', 'CONFIRMED', 'ADJUSTED'), defaultValue: 'CONFIRMED' },
            isDeleted:       { type: Sequelize.BOOLEAN, defaultValue: false },
            createdBy:       { type: Sequelize.UUID, allowNull: true },
            createdByName:   { type: Sequelize.STRING(100), allowNull: true },
            createdAt:       { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
            updatedAt:       { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
        });

        // ═══════════════════════════════════════════════════════
        //  7. CREDIT NOTES (Purchase Returns / Revenue Decrease)
        // ═══════════════════════════════════════════════════════
        await queryInterface.createTable('credit_notes', {
            id:              { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
            noteNumber:      { type: Sequelize.STRING(50), allowNull: false, unique: true },
            noteDate:        { type: Sequelize.DATEONLY, allowNull: false },
            partyId:         { type: Sequelize.UUID, allowNull: true },
            partyName:       { type: Sequelize.STRING(200), allowNull: true },
            partyType:       { type: Sequelize.ENUM('customer', 'supplier'), defaultValue: 'customer' },
            againstOrderId:  { type: Sequelize.UUID, allowNull: true },
            againstBillId:   { type: Sequelize.UUID, allowNull: true },
            reason:          { type: Sequelize.TEXT, allowNull: true },
            subTotal:        { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            cgst:            { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            sgst:            { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            igst:            { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            total:           { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            status:          { type: Sequelize.ENUM('DRAFT', 'CONFIRMED', 'ADJUSTED'), defaultValue: 'CONFIRMED' },
            isDeleted:       { type: Sequelize.BOOLEAN, defaultValue: false },
            createdBy:       { type: Sequelize.UUID, allowNull: true },
            createdByName:   { type: Sequelize.STRING(100), allowNull: true },
            createdAt:       { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
            updatedAt:       { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
        });

        // ═══════════════════════════════════════════════════════
        //  8. JOURNAL VOUCHERS (Manual journal entries — Tally Journal)
        // ═══════════════════════════════════════════════════════
        await queryInterface.createTable('journal_vouchers', {
            id:            { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
            voucherNumber: { type: Sequelize.STRING(50), allowNull: false, unique: true },
            voucherDate:   { type: Sequelize.DATEONLY, allowNull: false },
            voucherType:   { type: Sequelize.ENUM('JOURNAL','CONTRA','PAYMENT','RECEIPT'), defaultValue: 'JOURNAL' },
            narration:     { type: Sequelize.TEXT, allowNull: true },
            totalDebit:    { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            totalCredit:   { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            isPosted:      { type: Sequelize.BOOLEAN, defaultValue: true },
            isDeleted:     { type: Sequelize.BOOLEAN, defaultValue: false },
            batchId:       { type: Sequelize.UUID, allowNull: true },
            createdBy:     { type: Sequelize.UUID, allowNull: true },
            createdByName: { type: Sequelize.STRING(100), allowNull: true },
            createdAt:     { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
            updatedAt:     { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
        });
        await queryInterface.addIndex('journal_vouchers', ['voucherDate'], { name: 'idx_jv_date' });

        // ═══════════════════════════════════════════════════════
        //  9. JOURNAL VOUCHER LINES
        // ═══════════════════════════════════════════════════════
        await queryInterface.createTable('journal_voucher_lines', {
            id:             { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
            voucherId:      { type: Sequelize.UUID, allowNull: false },
            accountId:      { type: Sequelize.UUID, allowNull: false },
            accountName:    { type: Sequelize.STRING(200), allowNull: true },
            debit:          { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            credit:         { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            narration:      { type: Sequelize.TEXT, allowNull: true },
            costCenterId:   { type: Sequelize.UUID, allowNull: true },
            createdAt:      { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
            updatedAt:      { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
        });
        await queryInterface.addIndex('journal_voucher_lines', ['voucherId'], { name: 'idx_jvl_voucher' });
        await queryInterface.addIndex('journal_voucher_lines', ['accountId'], { name: 'idx_jvl_account' });

        // ═══════════════════════════════════════════════════════
        //  10. BUDGETS
        // ═══════════════════════════════════════════════════════
        await queryInterface.createTable('budgets', {
            id:             { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
            name:           { type: Sequelize.STRING(100), allowNull: false },
            financialYear:  { type: Sequelize.STRING(10), allowNull: false },
            accountId:      { type: Sequelize.UUID, allowNull: false },
            accountName:    { type: Sequelize.STRING(200), allowNull: true },
            period:         { type: Sequelize.ENUM('MONTHLY','QUARTERLY','YEARLY'), defaultValue: 'MONTHLY' },
            month:          { type: Sequelize.INTEGER, allowNull: true },
            quarter:        { type: Sequelize.INTEGER, allowNull: true },
            budgetedAmount: { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            actualAmount:   { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            variance:       { type: Sequelize.DECIMAL(15, 2), defaultValue: 0 },
            createdAt:      { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
            updatedAt:      { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
        });
        await queryInterface.addIndex('budgets', ['financialYear', 'accountId'], { name: 'idx_budget_fy_account' });

        // ═══════════════════════════════════════════════════════
        //  11. ADD GST COLUMNS TO EXISTING TABLES
        // ═══════════════════════════════════════════════════════

        // Products: HSN code + GST rate
        await queryInterface.addColumn('products', 'hsnCode',     { type: Sequelize.STRING(20),  allowNull: true });
        await queryInterface.addColumn('products', 'sacCode',     { type: Sequelize.STRING(20),  allowNull: true });
        await queryInterface.addColumn('products', 'gstRate',     { type: Sequelize.DECIMAL(5,2), defaultValue: 0 });
        await queryInterface.addColumn('products', 'cgstRate',    { type: Sequelize.DECIMAL(5,2), defaultValue: 0 });
        await queryInterface.addColumn('products', 'sgstRate',    { type: Sequelize.DECIMAL(5,2), defaultValue: 0 });
        await queryInterface.addColumn('products', 'igstRate',    { type: Sequelize.DECIMAL(5,2), defaultValue: 0 });
        await queryInterface.addColumn('products', 'cessRate',    { type: Sequelize.DECIMAL(5,2), defaultValue: 0 });
        await queryInterface.addColumn('products', 'unit',        { type: Sequelize.STRING(20),  defaultValue: 'KG' });
        await queryInterface.addColumn('products', 'description', { type: Sequelize.TEXT,         allowNull: true });
        await queryInterface.addColumn('products', 'openingStock',{ type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('products', 'minStockQty', { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('products', 'isActive',    { type: Sequelize.BOOLEAN,       defaultValue: true });

        // Customers: GST type + state + credit limit
        await queryInterface.addColumn('customers', 'stateCode',      { type: Sequelize.STRING(5),   allowNull: true });
        await queryInterface.addColumn('customers', 'stateName',      { type: Sequelize.STRING(50),  allowNull: true });
        await queryInterface.addColumn('customers', 'gstType',        { type: Sequelize.ENUM('REGISTERED','UNREGISTERED','CONSUMER','COMPOSITION'), defaultValue: 'UNREGISTERED' });
        await queryInterface.addColumn('customers', 'creditLimit',    { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('customers', 'creditDays',     { type: Sequelize.INTEGER,       defaultValue: 0 });
        await queryInterface.addColumn('customers', 'panNumber',      { type: Sequelize.STRING(20),    allowNull: true });
        await queryInterface.addColumn('customers', 'isActive',       { type: Sequelize.BOOLEAN,       defaultValue: true });

        // Suppliers: GST type + state + TDS rate
        await queryInterface.addColumn('suppliers', 'stateCode',      { type: Sequelize.STRING(5),   allowNull: true });
        await queryInterface.addColumn('suppliers', 'stateName',      { type: Sequelize.STRING(50),  allowNull: true });
        await queryInterface.addColumn('suppliers', 'gstType',        { type: Sequelize.ENUM('REGISTERED','UNREGISTERED','COMPOSITION'), defaultValue: 'REGISTERED' });
        await queryInterface.addColumn('suppliers', 'panNumber',      { type: Sequelize.STRING(20),  allowNull: true });
        await queryInterface.addColumn('suppliers', 'tdsRate',        { type: Sequelize.DECIMAL(5,2), defaultValue: 0 });
        await queryInterface.addColumn('suppliers', 'tdsSection',     { type: Sequelize.STRING(20),  allowNull: true });
        await queryInterface.addColumn('suppliers', 'isActive',       { type: Sequelize.BOOLEAN,     defaultValue: true });

        // Orders: Full GST breakdown
        await queryInterface.addColumn('orders', 'cgst',              { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('orders', 'sgst',              { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('orders', 'igst',              { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('orders', 'cess',              { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('orders', 'supplyType',        { type: Sequelize.ENUM('INTRASTATE','INTERSTATE','EXPORT'), defaultValue: 'INTRASTATE' });
        await queryInterface.addColumn('orders', 'reverseCharge',     { type: Sequelize.BOOLEAN, defaultValue: false });
        await queryInterface.addColumn('orders', 'eInvoiceIRN',       { type: Sequelize.STRING(200), allowNull: true });
        await queryInterface.addColumn('orders', 'eWayBillNo',        { type: Sequelize.STRING(50),  allowNull: true });
        await queryInterface.addColumn('orders', 'dueDate',           { type: Sequelize.DATEONLY,    allowNull: true });
        await queryInterface.addColumn('orders', 'discount',          { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('orders', 'discountPercent',   { type: Sequelize.DECIMAL(5,2),  defaultValue: 0 });
        await queryInterface.addColumn('orders', 'bankAccountId',     { type: Sequelize.UUID,        allowNull: true });
        await queryInterface.addColumn('orders', 'costCenterId',      { type: Sequelize.UUID,        allowNull: true });

        // OrderItems: HSN code + GST breakdown per line
        await queryInterface.addColumn('orderItems', 'hsnCode',      { type: Sequelize.STRING(20),   allowNull: true });
        await queryInterface.addColumn('orderItems', 'gstRate',      { type: Sequelize.DECIMAL(5,2),  defaultValue: 0 });
        await queryInterface.addColumn('orderItems', 'cgst',         { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('orderItems', 'sgst',         { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('orderItems', 'igst',         { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('orderItems', 'discount',     { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('orderItems', 'discountPct',  { type: Sequelize.DECIMAL(5,2),  defaultValue: 0 });
        await queryInterface.addColumn('orderItems', 'unit',         { type: Sequelize.STRING(20),    defaultValue: 'KG' });

        // PurchaseBills: Full GST breakdown
        await queryInterface.addColumn('purchaseBills', 'cgst',      { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('purchaseBills', 'sgst',      { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('purchaseBills', 'igst',      { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('purchaseBills', 'cess',      { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('purchaseBills', 'supplierGstin', { type: Sequelize.STRING(20), allowNull: true });
        await queryInterface.addColumn('purchaseBills', 'placeOfSupply', { type: Sequelize.STRING(10), allowNull: true });
        await queryInterface.addColumn('purchaseBills', 'supplyType', { type: Sequelize.ENUM('INTRASTATE','INTERSTATE','IMPORT'), defaultValue: 'INTRASTATE' });
        await queryInterface.addColumn('purchaseBills', 'reverseCharge', { type: Sequelize.BOOLEAN,   defaultValue: false });
        await queryInterface.addColumn('purchaseBills', 'dueDate',    { type: Sequelize.DATEONLY,    allowNull: true });
        await queryInterface.addColumn('purchaseBills', 'discount',   { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('purchaseBills', 'bankAccountId', { type: Sequelize.UUID,    allowNull: true });

        // Payments: Bank account linkage
        await queryInterface.addColumn('payments', 'bankAccountId',   { type: Sequelize.UUID,        allowNull: true });
        await queryInterface.addColumn('payments', 'chequeNo',        { type: Sequelize.STRING(50),  allowNull: true });
        await queryInterface.addColumn('payments', 'chequeDate',      { type: Sequelize.DATEONLY,    allowNull: true });
        await queryInterface.addColumn('payments', 'utrNo',           { type: Sequelize.STRING(50),  allowNull: true });
        await queryInterface.addColumn('payments', 'tdsAmount',       { type: Sequelize.DECIMAL(15,2), defaultValue: 0 });
        await queryInterface.addColumn('payments', 'tdsSection',      { type: Sequelize.STRING(20),  allowNull: true });
        await queryInterface.addColumn('payments', 'costCenterId',    { type: Sequelize.UUID,        allowNull: true });

        // ═══════════════════════════════════════════════════════
        //  12. SEED DEFAULT VOUCHER TYPES
        // ═══════════════════════════════════════════════════════
        const { randomUUID } = require('crypto');
        await queryInterface.bulkInsert('voucher_types', [
            { id: randomUUID(), name: 'Sales',       type: 'SALES',       prefix: 'INV',  lastNumber: 0, isActive: true, affectsStock: true,  createdAt: new Date(), updatedAt: new Date() },
            { id: randomUUID(), name: 'Purchase',    type: 'PURCHASE',    prefix: 'BILL', lastNumber: 0, isActive: true, affectsStock: true,  createdAt: new Date(), updatedAt: new Date() },
            { id: randomUUID(), name: 'Receipt',     type: 'RECEIPT',     prefix: 'RCP',  lastNumber: 0, isActive: true, affectsStock: false, createdAt: new Date(), updatedAt: new Date() },
            { id: randomUUID(), name: 'Payment',     type: 'PAYMENT',     prefix: 'PAY',  lastNumber: 0, isActive: true, affectsStock: false, createdAt: new Date(), updatedAt: new Date() },
            { id: randomUUID(), name: 'Journal',     type: 'JOURNAL',     prefix: 'JNL',  lastNumber: 0, isActive: true, affectsStock: false, createdAt: new Date(), updatedAt: new Date() },
            { id: randomUUID(), name: 'Contra',      type: 'CONTRA',      prefix: 'CTR',  lastNumber: 0, isActive: true, affectsStock: false, createdAt: new Date(), updatedAt: new Date() },
            { id: randomUUID(), name: 'Debit Note',  type: 'DEBIT_NOTE',  prefix: 'DN',   lastNumber: 0, isActive: true, affectsStock: true,  createdAt: new Date(), updatedAt: new Date() },
            { id: randomUUID(), name: 'Credit Note', type: 'CREDIT_NOTE', prefix: 'CN',   lastNumber: 0, isActive: true, affectsStock: true,  createdAt: new Date(), updatedAt: new Date() },
        ]);

        // Seed default bank accounts (Cash)
        await queryInterface.bulkInsert('bank_accounts', [
            { id: randomUUID(), name: 'Cash in Hand', bankName: null, accountNumber: null, ifscCode: null, branchName: null, accountType: 'CASH', openingBalance: 0, currentBalance: 0, isActive: true, isDefault: true, notes: 'Default cash account', createdAt: new Date(), updatedAt: new Date() }
        ]);
    },

    down: async (queryInterface, Sequelize) => {
        // Drop new tables
        await queryInterface.dropTable('journal_voucher_lines').catch(() => {});
        await queryInterface.dropTable('journal_vouchers').catch(() => {});
        await queryInterface.dropTable('budgets').catch(() => {});
        await queryInterface.dropTable('bank_statement_lines').catch(() => {});
        await queryInterface.dropTable('credit_notes').catch(() => {});
        await queryInterface.dropTable('debit_notes').catch(() => {});
        await queryInterface.dropTable('cost_centers').catch(() => {});
        await queryInterface.dropTable('voucher_types').catch(() => {});
        await queryInterface.dropTable('bank_accounts').catch(() => {});
        await queryInterface.dropTable('hsn_codes').catch(() => {});

        // Remove added columns (products)
        for (const col of ['hsnCode','sacCode','gstRate','cgstRate','sgstRate','igstRate','cessRate','unit','description','openingStock','minStockQty','isActive']) {
            await queryInterface.removeColumn('products', col).catch(() => {});
        }
        // Remove added columns (customers)
        for (const col of ['stateCode','stateName','gstType','creditLimit','creditDays','panNumber','isActive']) {
            await queryInterface.removeColumn('customers', col).catch(() => {});
        }
        // Remove added columns (suppliers)
        for (const col of ['stateCode','stateName','gstType','panNumber','tdsRate','tdsSection','isActive']) {
            await queryInterface.removeColumn('suppliers', col).catch(() => {});
        }
    }
};
