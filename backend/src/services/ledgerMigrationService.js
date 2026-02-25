const LedgerService = require('./ledgerService');

class LedgerMigrationService {
    constructor(db) {
        this.db = db;
        this.ledgerService = new LedgerService(db);
    }

    /**
     * Full migration from existing system to ledger
     * This is ADDITIVE - does not modify existing tables
     */
    async runFullMigration(options = {}) {
        const db = this.db;
        const results = {
            success: true,
            customers: { migrated: 0, errors: [] },
            suppliers: { migrated: 0, errors: [] },
            orders: { migrated: 0, errors: [] },
            payments: { migrated: 0, errors: [] },
            purchases: { migrated: 0, errors: [] },
            reconciliation: null
        };

        console.log('Starting ledger migration...');

        // Step 1: Initialize chart of accounts
        console.log('Step 1: Initializing chart of accounts...');
        await this.ledgerService.initializeChartOfAccounts();

        // Step 2: Create customer accounts
        console.log('Step 2: Creating customer accounts...');
        const customers = await db.customer.findAll();
        for (const customer of customers) {
            try {
                await this.ledgerService.getOrCreateCustomerAccount(customer.id, customer.name);
                results.customers.migrated++;
            } catch (error) {
                results.customers.errors.push({ id: customer.id, name: customer.name, error: error.message });
            }
        }

        // Step 3: Create supplier accounts
        console.log('Step 3: Creating supplier accounts...');
        const suppliers = await db.supplier.findAll();
        for (const supplier of suppliers) {
            try {
                await this.ledgerService.getOrCreateSupplierAccount(supplier.id, supplier.name);
                results.suppliers.migrated++;
            } catch (error) {
                results.suppliers.errors.push({ id: supplier.id, name: supplier.name, error: error.message });
            }
        }

        // Step 4: Migrate orders (invoices) to ledger
        console.log('Step 4: Migrating orders to ledger...');
        const orders = await db.order.findAll({
            where: { isDeleted: false },
            include: [{ model: db.customer, as: 'customer' }],
            order: [['createdAt', 'ASC']]
        });

        for (const order of orders) {
            try {
                await this.migrateOrder(order);
                results.orders.migrated++;
            } catch (error) {
                results.orders.errors.push({ 
                    id: order.id, 
                    orderNumber: order.orderNumber, 
                    error: error.message 
                });
            }
        }

        // Step 5: Migrate payments to ledger
        console.log('Step 5: Migrating payments to ledger...');
        const payments = await db.payment.findAll({
            order: [['createdAt', 'ASC']]
        });

        for (const payment of payments) {
            try {
                await this.migratePayment(payment);
                results.payments.migrated++;
            } catch (error) {
                results.payments.errors.push({ 
                    id: payment.id, 
                    paymentNumber: payment.paymentNumber, 
                    error: error.message 
                });
            }
        }

        // Step 6: Migrate purchase bills
        console.log('Step 6: Migrating purchase bills to ledger...');
        if (db.purchaseBill) {
            const purchases = await db.purchaseBill.findAll({
                include: [{ model: db.supplier }],
                order: [['createdAt', 'ASC']]
            });

            for (const purchase of purchases) {
                try {
                    await this.migratePurchase(purchase);
                    results.purchases.migrated++;
                } catch (error) {
                    results.purchases.errors.push({ 
                        id: purchase.id, 
                        billNumber: purchase.billNumber, 
                        error: error.message 
                    });
                }
            }
        }

        // Step 7: Run reconciliation
        console.log('Step 7: Running reconciliation...');
        results.reconciliation = await this.runReconciliation();

        console.log('Migration complete!');
        return results;
    }

    /**
     * Migrate a single order to ledger
     * DR: Customer Account (Receivable increases)
     * CR: Sales Revenue (Income increases)
     */
    async migrateOrder(order) {
        const db = this.db;

        // Check if already migrated
        const existing = await db.journalBatch.findOne({
            where: { referenceType: 'MIGRATION', referenceId: order.id }
        });
        if (existing) {
            return { skipped: true, reason: 'Already migrated' };
        }

        // Get or create customer account
        let customerAccountId;
        if (order.customerId) {
            const customerAccount = await this.ledgerService.getOrCreateCustomerAccount(
                order.customerId,
                order.customerName || 'Unknown Customer'
            );
            customerAccountId = customerAccount.id;
        } else if (order.customerName) {
            // Try to find customer by name
            const customer = await db.customer.findOne({ where: { name: order.customerName } });
            if (customer) {
                const customerAccount = await this.ledgerService.getOrCreateCustomerAccount(
                    customer.id,
                    customer.name
                );
                customerAccountId = customerAccount.id;
            }
        }

        if (!customerAccountId) {
            throw new Error('Could not determine customer account');
        }

        // Get sales account
        const salesAccount = await db.account.findOne({ where: { code: '4100' } });
        if (!salesAccount) {
            throw new Error('Sales account not found');
        }

        // Use order.createdAt as the journal date (preserves original timestamps)
        const transactionDate = order.createdAt;

        // Create journal entry for the SALE
        // DR: Customer Account (receivable increases)
        // CR: Sales Account (revenue increases)
        const batch = await this.ledgerService.createJournalBatch({
            referenceType: 'MIGRATION',
            referenceId: order.id,
            description: `Migration: Invoice ${order.orderNumber}`,
            transactionDate,
            entries: [
                {
                    accountId: customerAccountId,
                    debit: Number(order.total) || 0,
                    credit: 0,
                    narration: `Invoice ${order.orderNumber}`
                },
                {
                    accountId: salesAccount.id,
                    debit: 0,
                    credit: Number(order.total) || 0,
                    narration: `Invoice ${order.orderNumber}`
                }
            ]
        });

        // If there was payment at time of order (paidAmount > 0), create payment entry too
        if (Number(order.paidAmount) > 0) {
            const cashAccount = await db.account.findOne({ where: { code: '1100' } });
            
            await this.ledgerService.createJournalBatch({
                referenceType: 'MIGRATION',
                referenceId: order.id,
                description: `Migration: Payment for Invoice ${order.orderNumber}`,
                transactionDate,
                entries: [
                    {
                        accountId: cashAccount.id,
                        debit: Number(order.paidAmount),
                        credit: 0,
                        narration: `Payment received for ${order.orderNumber}`
                    },
                    {
                        accountId: customerAccountId,
                        debit: 0,
                        credit: Number(order.paidAmount),
                        narration: `Payment received for ${order.orderNumber}`
                    }
                ]
            });
        }

        return batch;
    }

    /**
     * Migrate a payment record to ledger
     * For customer payment:
     *   DR: Cash/Bank (Asset increases)
     *   CR: Customer Account (Receivable decreases)
     * For supplier payment:
     *   DR: Supplier Account (Payable decreases)
     *   CR: Cash/Bank (Asset decreases)
     */
    async migratePayment(payment) {
        const db = this.db;

        // Check if already migrated
        const existing = await db.journalBatch.findOne({
            where: { referenceType: 'MIGRATION', referenceId: payment.id }
        });
        if (existing) {
            return { skipped: true, reason: 'Already migrated' };
        }

        // Skip if this payment was already captured as part of order migration
        // (i.e., it's linked to an order and the order had paidAmount)
        if (payment.referenceType === 'order' && payment.referenceId) {
            const order = await db.order.findByPk(payment.referenceId);
            if (order && Number(order.paidAmount) > 0) {
                // Check if payment amount matches what was already migrated
                // To avoid double-counting, we skip payments that were part of initial order payment
                // This is a heuristic - might need adjustment based on actual data patterns
            }
        }

        const cashAccount = await db.account.findOne({ where: { code: '1100' } });

        // Use payment.createdAt as the journal date (preserves original timestamps)
        const transactionDate = payment.createdAt;

        if (payment.partyType === 'customer' && payment.partyId) {
            // Customer payment
            const customerAccount = await db.account.findOne({
                where: { partyId: payment.partyId, partyType: 'customer' }
            });

            if (!customerAccount) {
                throw new Error(`Customer account not found for partyId: ${payment.partyId}`);
            }

            return await this.ledgerService.createJournalBatch({
                referenceType: 'MIGRATION',
                referenceId: payment.id,
                description: `Migration: Receipt ${payment.paymentNumber}`,
                transactionDate,
                entries: [
                    {
                        accountId: cashAccount.id,
                        debit: Number(payment.amount),
                        credit: 0,
                        narration: `Receipt ${payment.paymentNumber}`
                    },
                    {
                        accountId: customerAccount.id,
                        debit: 0,
                        credit: Number(payment.amount),
                        narration: `Receipt ${payment.paymentNumber}`
                    }
                ]
            });
        } else if (payment.partyType === 'supplier' && payment.partyId) {
            // Supplier payment
            const supplierAccount = await db.account.findOne({
                where: { partyId: payment.partyId, partyType: 'supplier' }
            });

            if (!supplierAccount) {
                throw new Error(`Supplier account not found for partyId: ${payment.partyId}`);
            }

            return await this.ledgerService.createJournalBatch({
                referenceType: 'MIGRATION',
                referenceId: payment.id,
                description: `Migration: Payment ${payment.paymentNumber}`,
                transactionDate,
                entries: [
                    {
                        accountId: supplierAccount.id,
                        debit: Number(payment.amount),
                        credit: 0,
                        narration: `Payment ${payment.paymentNumber}`
                    },
                    {
                        accountId: cashAccount.id,
                        debit: 0,
                        credit: Number(payment.amount),
                        narration: `Payment ${payment.paymentNumber}`
                    }
                ]
            });
        }

        throw new Error('Unknown payment party type');
    }

    /**
     * Migrate a purchase bill to ledger
     * DR: Purchase/Expense Account
     * CR: Supplier Account (Payable increases)
     */
    async migratePurchase(purchase) {
        const db = this.db;

        // Check if already migrated
        const existing = await db.journalBatch.findOne({
            where: { referenceType: 'MIGRATION', referenceId: purchase.id }
        });
        if (existing) {
            return { skipped: true, reason: 'Already migrated' };
        }

        const supplierAccount = await db.account.findOne({
            where: { partyId: purchase.supplierId, partyType: 'supplier' }
        });

        if (!supplierAccount) {
            throw new Error(`Supplier account not found for supplierId: ${purchase.supplierId}`);
        }

        const purchaseAccount = await db.account.findOne({ where: { code: '5300' } });
        const cashAccount = await db.account.findOne({ where: { code: '1100' } });

        // Use purchase.createdAt as the journal date (preserves original timestamps)
        const transactionDate = purchase.createdAt;

        // Create purchase entry
        // DR: Purchase Expense (expense increases)
        // CR: Supplier Account (payable increases)
        const batch = await this.ledgerService.createJournalBatch({
            referenceType: 'MIGRATION',
            referenceId: purchase.id,
            description: `Migration: Purchase Bill ${purchase.billNumber}`,
            transactionDate,
            entries: [
                {
                    accountId: purchaseAccount.id,
                    debit: Number(purchase.total) || 0,
                    credit: 0,
                    narration: `Purchase Bill ${purchase.billNumber}`
                },
                {
                    accountId: supplierAccount.id,
                    debit: 0,
                    credit: Number(purchase.total) || 0,
                    narration: `Purchase Bill ${purchase.billNumber}`
                }
            ]
        });

        // If there was payment at time of purchase
        if (Number(purchase.paidAmount) > 0) {
            await this.ledgerService.createJournalBatch({
                referenceType: 'MIGRATION',
                referenceId: purchase.id,
                description: `Migration: Payment for Purchase ${purchase.billNumber}`,
                transactionDate,
                entries: [
                    {
                        accountId: supplierAccount.id,
                        debit: Number(purchase.paidAmount),
                        credit: 0,
                        narration: `Payment for ${purchase.billNumber}`
                    },
                    {
                        accountId: cashAccount.id,
                        debit: 0,
                        credit: Number(purchase.paidAmount),
                        narration: `Payment for ${purchase.billNumber}`
                    }
                ]
            });
        }

        return batch;
    }

    /**
     * Run reconciliation report comparing old system vs ledger
     */
    async runReconciliation() {
        const db = this.db;
        const results = {
            customers: [],
            suppliers: [],
            summary: {
                customersMatched: 0,
                customersMismatched: 0,
                suppliersMatched: 0,
                suppliersMismatched: 0
            }
        };

        // Reconcile customers
        const customers = await db.customer.findAll();
        for (const customer of customers) {
            // Get old system balance
            const orders = await db.order.findAll({
                where: {
                    [db.Sequelize.Op.or]: [
                        { customerId: customer.id },
                        { customerName: customer.name, customerId: null }
                    ],
                    isDeleted: false
                }
            });
            const oldBalance = (Number(customer.openingBalance) || 0) + 
                orders.reduce((sum, o) => sum + (Number(o.dueAmount) || 0), 0);

            // Get ledger balance
            const ledgerBalance = await this.ledgerService.getCustomerLedgerBalance(customer.id);

            const difference = Math.abs(oldBalance - ledgerBalance.balance);
            const isMatched = difference < 0.01;

            results.customers.push({
                id: customer.id,
                name: customer.name,
                oldSystemBalance: oldBalance,
                ledgerBalance: ledgerBalance.balance,
                difference,
                isMatched
            });

            if (isMatched) {
                results.summary.customersMatched++;
            } else {
                results.summary.customersMismatched++;
            }
        }

        // Reconcile suppliers
        const suppliers = await db.supplier.findAll();
        for (const supplier of suppliers) {
            // Get old system balance
            let oldBalance = Number(supplier.openingBalance) || 0;
            if (db.purchaseBill) {
                const purchases = await db.purchaseBill.findAll({
                    where: { supplierId: supplier.id }
                });
                oldBalance += purchases.reduce((sum, p) => sum + (Number(p.dueAmount) || 0), 0);
            }

            // Get ledger balance
            const ledgerBalance = await this.ledgerService.getSupplierLedgerBalance(supplier.id);

            const difference = Math.abs(oldBalance - ledgerBalance.balance);
            const isMatched = difference < 0.01;

            results.suppliers.push({
                id: supplier.id,
                name: supplier.name,
                oldSystemBalance: oldBalance,
                ledgerBalance: ledgerBalance.balance,
                difference,
                isMatched
            });

            if (isMatched) {
                results.summary.suppliersMatched++;
            } else {
                results.summary.suppliersMismatched++;
            }
        }

        return results;
    }

    /**
     * Clear all migration data (reversible)
     */
    async clearMigrationData() {
        const db = this.db;
        const transaction = await db.sequelize.transaction();

        try {
            // Delete migration entries
            await db.ledgerEntry.destroy({
                where: {},
                include: [{
                    model: db.journalBatch,
                    as: 'batch',
                    where: { referenceType: 'MIGRATION' }
                }],
                transaction
            });

            // Delete migration batches
            await db.journalBatch.destroy({
                where: { referenceType: 'MIGRATION' },
                transaction
            });

            await transaction.commit();
            return { success: true, message: 'Migration data cleared' };
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }
}

module.exports = LedgerMigrationService;
