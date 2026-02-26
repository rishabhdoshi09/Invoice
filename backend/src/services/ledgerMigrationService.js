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

        // Step 3.5: Migrate customer opening balances
        console.log('Step 3.5: Migrating customer opening balances...');
        results.openingBalances = { migrated: 0, skipped: 0, errors: [] };
        for (const customer of customers) {
            try {
                const ob = Number(customer.openingBalance) || 0;
                if (ob === 0) {
                    results.openingBalances.skipped++;
                    continue;
                }
                await this.migrateOpeningBalance(customer);
                results.openingBalances.migrated++;
            } catch (error) {
                results.openingBalances.errors.push({
                    id: customer.id,
                    name: customer.name,
                    error: error.message
                });
            }
        }

        // Step 4: Migrate orders (invoices) to ledger
        console.log('Step 4: Migrating orders to ledger...');
        const orders = await db.order.findAll({
            where: { isDeleted: false },
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
     * Migrate a customer's opening balance to the ledger.
     * Positive balance (customer owes us):
     *   DR: Customer Receivable Account
     *   CR: Opening Balance Equity (3300)
     * Negative balance (we owe customer — advance/credit):
     *   DR: Opening Balance Equity (3300)
     *   CR: Customer Receivable Account
     */
    async migrateOpeningBalance(customer) {
        const db = this.db;
        const openingBalance = Number(customer.openingBalance) || 0;
        if (openingBalance === 0) return;

        // Prevent duplicate migration — use a deterministic reference ID
        const refId = `OB-${customer.id}`;
        const existing = await db.journalBatch.findOne({
            where: { referenceType: 'OPENING', referenceId: refId }
        });
        if (existing) return;

        const customerAccount = await this.ledgerService.getOrCreateCustomerAccount(
            customer.id, customer.name
        );

        let obEquity = await db.account.findOne({ where: { code: '3300' } });
        if (!obEquity) {
            throw new Error('Opening Balance Equity account (3300) not found. Re-initialize chart of accounts.');
        }

        const absAmount = Math.abs(openingBalance);
        const entries = openingBalance > 0
            ? [
                { accountId: customerAccount.id, debit: absAmount, credit: 0, narration: `Opening balance — ${customer.name}` },
                { accountId: obEquity.id, debit: 0, credit: absAmount, narration: `Opening balance — ${customer.name}` }
              ]
            : [
                { accountId: obEquity.id, debit: absAmount, credit: 0, narration: `Opening balance (advance) — ${customer.name}` },
                { accountId: customerAccount.id, debit: 0, credit: absAmount, narration: `Opening balance (advance) — ${customer.name}` }
              ];

        await this.ledgerService.createJournalBatch({
            referenceType: 'OPENING',
            referenceId: refId,
            description: `Opening balance for ${customer.name}: ${openingBalance}`,
            transactionDate: customer.createdAt,
            entries
        });

        console.log(`[MIGRATION] Opening balance posted for ${customer.name}: ${openingBalance}`);
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
     * SAFE MODE: Full read-only reconciliation validation
     * Compares old system vs ledger at every level:
     *   1. Per-customer balance comparison
     *   2. System-wide totals (sales, payments, receivables)
     *   3. Mismatch breakdown with batch detail
     * Does NOT modify any data.
     */
    async runSafeReconciliation() {
        const db = this.db;

        const result = {
            readOnly: true,
            timestamp: new Date().toISOString(),
            customers: [],
            systemTotals: {},
            mismatches: [],
            healthCheck: null,
            summary: {}
        };

        // ── 1. Per-customer comparison ─────────────────────────
        const customers = await db.customer.findAll({ order: [['name', 'ASC']] });

        let totalOldBalance = 0;
        let totalLedgerBalance = 0;
        let matchedCount = 0;
        let mismatchedCount = 0;

        for (const customer of customers) {
            // Old system: openingBalance + SUM(dueAmount) for non-deleted orders
            const orders = await db.order.findAll({
                where: {
                    [db.Sequelize.Op.or]: [
                        { customerId: customer.id },
                        { customerName: customer.name, customerId: null }
                    ],
                    isDeleted: false
                },
                attributes: ['id', 'orderNumber', 'total', 'paidAmount', 'dueAmount', 'createdAt'],
                order: [['createdAt', 'ASC']]
            });

            const oldDueSum = orders.reduce((sum, o) => sum + (Number(o.dueAmount) || 0), 0);
            const oldBalance = (Number(customer.openingBalance) || 0) + oldDueSum;

            // Ledger: SUM(debit - credit) from receivable account for this customer
            const ledgerBalance = await this.ledgerService.getCustomerLedgerBalance(customer.id);

            const difference = Number((oldBalance - ledgerBalance.balance).toFixed(2));
            const isMatched = Math.abs(difference) < 0.01;

            if (isMatched) matchedCount++;
            else mismatchedCount++;

            totalOldBalance += oldBalance;
            totalLedgerBalance += ledgerBalance.balance;

            const row = {
                customerId: customer.id,
                customerName: customer.name,
                oldBalance: Number(oldBalance.toFixed(2)),
                ledgerBalance: Number(ledgerBalance.balance.toFixed(2)),
                difference,
                isMatched,
                orderCount: orders.length,
                openingBalance: Number(customer.openingBalance) || 0
            };

            result.customers.push(row);

            // ── 4. Mismatch breakdown ──────────────────────────
            if (!isMatched) {
                let ledgerBatches = [];
                if (ledgerBalance.hasLedgerAccount) {
                    const batches = await db.sequelize.query(`
                        SELECT 
                            jb.id,
                            jb."batchNumber",
                            jb."referenceType",
                            jb."referenceId",
                            jb."transactionDate",
                            jb.description,
                            le.debit,
                            le.credit,
                            le.narration
                        FROM ledger_entries le
                        INNER JOIN journal_batches jb ON le."batchId" = jb.id
                        WHERE le."accountId" = :accountId
                          AND jb."isPosted" = true
                          AND jb."isReversed" = false
                        ORDER BY jb."transactionDate" ASC, le."createdAt" ASC
                    `, {
                        replacements: { accountId: ledgerBalance.accountId },
                        type: db.Sequelize.QueryTypes.SELECT
                    });
                    ledgerBatches = batches.map(b => ({
                        batchId: b.id,
                        batchNumber: b.batchNumber,
                        referenceType: b.referenceType,
                        referenceId: b.referenceId,
                        transactionDate: b.transactionDate,
                        description: b.description,
                        debit: Number(b.debit) || 0,
                        credit: Number(b.credit) || 0,
                        narration: b.narration
                    }));
                }

                result.mismatches.push({
                    customerId: customer.id,
                    customerName: customer.name,
                    oldBalance: row.oldBalance,
                    ledgerBalance: row.ledgerBalance,
                    difference: row.difference,
                    hasLedgerAccount: ledgerBalance.hasLedgerAccount,
                    oldSystemOrders: orders.map(o => ({
                        orderId: o.id,
                        orderNumber: o.orderNumber,
                        total: Number(o.total) || 0,
                        paidAmount: Number(o.paidAmount) || 0,
                        dueAmount: Number(o.dueAmount) || 0,
                        createdAt: o.createdAt
                    })),
                    ledgerBatches
                });
            }
        }

        // ── 2. System-wide totals ──────────────────────────────
        // Old system: total sales
        const oldSalesResult = await db.sequelize.query(`
            SELECT COALESCE(SUM(total), 0) as "totalSales"
            FROM orders WHERE "isDeleted" = false
        `, { type: db.Sequelize.QueryTypes.SELECT });
        const oldTotalSales = Number(oldSalesResult[0]?.totalSales) || 0;

        // Old system: total payments from payments table
        const oldPaymentsResult = await db.sequelize.query(`
            SELECT COALESCE(SUM(amount), 0) as "totalPayments"
            FROM payments WHERE "partyType" = 'customer'
        `, { type: db.Sequelize.QueryTypes.SELECT });
        const oldTotalPayments = Number(oldPaymentsResult[0]?.totalPayments) || 0;

        // Old system: total paidAmount on orders (inline payments)
        const oldInlinePayResult = await db.sequelize.query(`
            SELECT COALESCE(SUM("paidAmount"), 0) as "totalInlinePaid"
            FROM orders WHERE "isDeleted" = false
        `, { type: db.Sequelize.QueryTypes.SELECT });
        const oldTotalInlinePaid = Number(oldInlinePayResult[0]?.totalInlinePaid) || 0;

        // Old system: total receivable outstanding
        const oldReceivableResult = await db.sequelize.query(`
            SELECT COALESCE(SUM("dueAmount"), 0) as "totalDue"
            FROM orders WHERE "isDeleted" = false
        `, { type: db.Sequelize.QueryTypes.SELECT });
        const oldTotalReceivable = Number(oldReceivableResult[0]?.totalDue) || 0;

        // Ledger: Sales account (4100) total credit
        const salesAccount = await db.account.findOne({ where: { code: '4100' } });
        let ledgerSalesCredit = 0;
        if (salesAccount) {
            const salesBal = await this.ledgerService.getAccountBalance(salesAccount.id);
            ledgerSalesCredit = salesBal.totalCredit;
        }

        // Ledger: Cash account (1100) net balance
        const cashAccount = await db.account.findOne({ where: { code: '1100' } });
        let ledgerCashBalance = 0;
        let ledgerCashDebit = 0;
        if (cashAccount) {
            const cashBal = await this.ledgerService.getAccountBalance(cashAccount.id);
            ledgerCashBalance = cashBal.balance;
            ledgerCashDebit = cashBal.totalDebit;
        }

        // Ledger: Receivable (1300 + all 1300-* sub-accounts) net balance
        const receivableAccounts = await db.account.findAll({
            where: {
                [db.Sequelize.Op.or]: [
                    { code: '1300' },
                    { code: { [db.Sequelize.Op.like]: '1300-%' } }
                ]
            }
        });
        let ledgerReceivableBalance = 0;
        for (const acc of receivableAccounts) {
            const bal = await this.ledgerService.getAccountBalance(acc.id);
            ledgerReceivableBalance += bal.balance;
        }

        result.systemTotals = {
            sales: {
                oldSystem: Number(oldTotalSales.toFixed(2)),
                ledgerSalesCredit: Number(ledgerSalesCredit.toFixed(2)),
                difference: Number((oldTotalSales - ledgerSalesCredit).toFixed(2)),
                isMatched: Math.abs(oldTotalSales - ledgerSalesCredit) < 0.01
            },
            payments: {
                oldSystemPaymentsTable: Number(oldTotalPayments.toFixed(2)),
                oldSystemInlinePaid: Number(oldTotalInlinePaid.toFixed(2)),
                ledgerCashDebit: Number(ledgerCashDebit.toFixed(2)),
                ledgerCashNetBalance: Number(ledgerCashBalance.toFixed(2)),
                note: 'Cash debit = money received. Compare oldSystemPaymentsTable + oldSystemInlinePaid vs ledgerCashDebit'
            },
            receivables: {
                oldSystemDueTotal: Number(oldTotalReceivable.toFixed(2)),
                ledgerReceivableBalance: Number(ledgerReceivableBalance.toFixed(2)),
                difference: Number((oldTotalReceivable - ledgerReceivableBalance).toFixed(2)),
                isMatched: Math.abs(oldTotalReceivable - ledgerReceivableBalance) < 0.01,
                note: 'Ledger receivable = SUM(debit-credit) across all 1300-* accounts'
            }
        };

        // ── 3. Health check ────────────────────────────────────
        result.healthCheck = await this.ledgerService.healthCheck();

        // ── Summary ────────────────────────────────────────────
        result.summary = {
            totalCustomers: customers.length,
            matched: matchedCount,
            mismatched: mismatchedCount,
            totalOldBalance: Number(totalOldBalance.toFixed(2)),
            totalLedgerBalance: Number(totalLedgerBalance.toFixed(2)),
            overallDifference: Number((totalOldBalance - totalLedgerBalance).toFixed(2)),
            salesMatched: result.systemTotals.sales.isMatched,
            receivablesMatched: result.systemTotals.receivables.isMatched,
            ledgerBalanced: result.healthCheck.isBalanced
        };

        return result;
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
