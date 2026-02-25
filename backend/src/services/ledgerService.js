const { v4: uuidv4 } = require('uuid');

class LedgerService {
    constructor(db) {
        this.db = db;
    }

    // ==================== ACCOUNT MANAGEMENT ====================

    /**
     * Create default chart of accounts (run once during setup)
     */
    async initializeChartOfAccounts() {
        const db = this.db;
        const defaultAccounts = [
            // ASSET Accounts
            { code: '1000', name: 'Assets', type: 'ASSET', isSystemAccount: true },
            { code: '1100', name: 'Cash', type: 'ASSET', subType: 'CASH', parentCode: '1000', isSystemAccount: true },
            { code: '1200', name: 'Bank', type: 'ASSET', subType: 'BANK', parentCode: '1000', isSystemAccount: true },
            { code: '1300', name: 'Accounts Receivable', type: 'ASSET', subType: 'RECEIVABLE', parentCode: '1000', isSystemAccount: true },
            { code: '1400', name: 'Inventory', type: 'ASSET', subType: 'INVENTORY', parentCode: '1000', isSystemAccount: true },

            // LIABILITY Accounts
            { code: '2000', name: 'Liabilities', type: 'LIABILITY', isSystemAccount: true },
            { code: '2100', name: 'Accounts Payable', type: 'LIABILITY', subType: 'PAYABLE', parentCode: '2000', isSystemAccount: true },
            { code: '2200', name: 'GST Payable', type: 'LIABILITY', subType: 'TAX', parentCode: '2000', isSystemAccount: true },

            // EQUITY Accounts
            { code: '3000', name: 'Equity', type: 'EQUITY', isSystemAccount: true },
            { code: '3100', name: 'Owner\'s Capital', type: 'EQUITY', parentCode: '3000', isSystemAccount: true },
            { code: '3200', name: 'Retained Earnings', type: 'EQUITY', parentCode: '3000', isSystemAccount: true },

            // INCOME Accounts
            { code: '4000', name: 'Income', type: 'INCOME', isSystemAccount: true },
            { code: '4100', name: 'Sales Revenue', type: 'INCOME', subType: 'SALES', parentCode: '4000', isSystemAccount: true },
            { code: '4200', name: 'Other Income', type: 'INCOME', parentCode: '4000', isSystemAccount: true },

            // EXPENSE Accounts
            { code: '5000', name: 'Expenses', type: 'EXPENSE', isSystemAccount: true },
            { code: '5100', name: 'Cost of Goods Sold', type: 'EXPENSE', subType: 'COGS', parentCode: '5000', isSystemAccount: true },
            { code: '5200', name: 'Operating Expenses', type: 'EXPENSE', parentCode: '5000', isSystemAccount: true },
            { code: '5300', name: 'Purchase Expenses', type: 'EXPENSE', subType: 'PURCHASE', parentCode: '5000', isSystemAccount: true },
        ];

        const transaction = await db.sequelize.transaction();
        try {
            // First pass: create accounts without parent references
            const accountMap = {};
            for (const acc of defaultAccounts) {
                const existing = await db.account.findOne({ where: { code: acc.code }, transaction });
                if (!existing) {
                    const created = await db.account.create({
                        code: acc.code,
                        name: acc.name,
                        type: acc.type,
                        subType: acc.subType || null,
                        isSystemAccount: acc.isSystemAccount || false,
                        description: acc.description || null
                    }, { transaction });
                    accountMap[acc.code] = created.id;
                } else {
                    accountMap[acc.code] = existing.id;
                }
            }

            // Second pass: update parent references
            for (const acc of defaultAccounts) {
                if (acc.parentCode && accountMap[acc.parentCode]) {
                    await db.account.update(
                        { parentId: accountMap[acc.parentCode] },
                        { where: { code: acc.code }, transaction }
                    );
                }
            }

            await transaction.commit();
            return { success: true, message: 'Chart of accounts initialized' };
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    /**
     * Create or get customer account (sub-account under Accounts Receivable)
     */
    async getOrCreateCustomerAccount(customerId, customerName, transaction = null) {
        const db = this.db;
        
        // Check if account exists for this customer
        let account = await db.account.findOne({
            where: { partyId: customerId, partyType: 'customer' },
            transaction
        });

        if (!account) {
            // Get parent Accounts Receivable account
            const arAccount = await db.account.findOne({
                where: { code: '1300' },
                transaction
            });

            // Generate unique code for customer
            const lastCustomerAccount = await db.account.findOne({
                where: { 
                    partyType: 'customer',
                    code: { [db.Sequelize.Op.like]: '1300-%' }
                },
                order: [['code', 'DESC']],
                transaction
            });

            let newCode = '1300-001';
            if (lastCustomerAccount) {
                const lastNum = parseInt(lastCustomerAccount.code.split('-')[1]) || 0;
                newCode = `1300-${String(lastNum + 1).padStart(3, '0')}`;
            }

            account = await db.account.create({
                code: newCode,
                name: customerName,
                type: 'ASSET',
                subType: 'RECEIVABLE',
                parentId: arAccount?.id,
                partyId: customerId,
                partyType: 'customer',
                isSystemAccount: false
            }, { transaction });
        }

        return account;
    }

    /**
     * Create or get supplier account (sub-account under Accounts Payable)
     */
    async getOrCreateSupplierAccount(supplierId, supplierName, transaction = null) {
        const db = this.db;
        
        let account = await db.account.findOne({
            where: { partyId: supplierId, partyType: 'supplier' },
            transaction
        });

        if (!account) {
            const apAccount = await db.account.findOne({
                where: { code: '2100' },
                transaction
            });

            const lastSupplierAccount = await db.account.findOne({
                where: { 
                    partyType: 'supplier',
                    code: { [db.Sequelize.Op.like]: '2100-%' }
                },
                order: [['code', 'DESC']],
                transaction
            });

            let newCode = '2100-001';
            if (lastSupplierAccount) {
                const lastNum = parseInt(lastSupplierAccount.code.split('-')[1]) || 0;
                newCode = `2100-${String(lastNum + 1).padStart(3, '0')}`;
            }

            account = await db.account.create({
                code: newCode,
                name: supplierName,
                type: 'LIABILITY',
                subType: 'PAYABLE',
                parentId: apAccount?.id,
                partyId: supplierId,
                partyType: 'supplier',
                isSystemAccount: false
            }, { transaction });
        }

        return account;
    }

    /**
     * Get account by code
     */
    async getAccountByCode(code) {
        return await this.db.account.findOne({ where: { code } });
    }

    /**
     * List all accounts
     */
    async listAccounts(filters = {}) {
        const where = {};
        if (filters.type) where.type = filters.type;
        if (filters.isActive !== undefined) where.isActive = filters.isActive;
        
        return await this.db.account.findAll({
            where,
            order: [['code', 'ASC']],
            include: [{ model: this.db.account, as: 'parent', attributes: ['id', 'code', 'name'] }]
        });
    }

    // ==================== JOURNAL BATCH OPERATIONS ====================

    /**
     * Generate unique batch number
     */
    async generateBatchNumber(referenceType) {
        const prefix = {
            'INVOICE': 'JV-INV',
            'PAYMENT': 'JV-PAY',
            'PURCHASE': 'JV-PUR',
            'EXPENSE': 'JV-EXP',
            'MIGRATION': 'JV-MIG',
            'ADJUSTMENT': 'JV-ADJ',
            'OPENING': 'JV-OPN'
        }[referenceType] || 'JV';

        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `${prefix}-${today}-${random}`;
    }

    /**
     * Create a journal batch with entries
     * @param {Object} batchData - { referenceType, referenceId, description, transactionDate, entries: [{accountId, debit, credit, narration}] }
     */
    async createJournalBatch(batchData, transaction = null) {
        const db = this.db;
        const shouldCommit = !transaction;
        if (!transaction) {
            transaction = await db.sequelize.transaction();
        }

        try {
            // Validate: prevent empty batches
            if (!batchData.entries || !Array.isArray(batchData.entries) || batchData.entries.length === 0) {
                throw new Error('Journal batch cannot be empty');
            }

            // Validate: minimum 2 entries for double-entry
            if (batchData.entries.length < 2) {
                throw new Error('Journal batch must have at least 2 entries');
            }

            // Calculate totals with strict validation
            let totalDebit = 0;
            let totalCredit = 0;
            for (const entry of batchData.entries) {
                const debit = Number(entry.debit);
                const credit = Number(entry.credit);

                if (isNaN(debit) || isNaN(credit)) {
                    throw new Error('Debit and credit values must be valid numbers');
                }
                if (debit < 0 || credit < 0) {
                    throw new Error('Debit and credit values cannot be negative');
                }
                totalDebit += debit;
                totalCredit += credit;
            }

            // Validate: batch must have actual monetary movement
            if (totalDebit === 0 && totalCredit === 0) {
                throw new Error('Journal batch has no monetary values');
            }

            // Check if balanced (SUM(debit) must equal SUM(credit))
            const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
            if (!isBalanced) {
                throw new Error(`Journal batch is not balanced. Debit: ${totalDebit.toFixed(2)}, Credit: ${totalCredit.toFixed(2)}, Difference: ${Math.abs(totalDebit - totalCredit).toFixed(2)}`);
            }

            // Create batch
            const batchNumber = await this.generateBatchNumber(batchData.referenceType);
            const batch = await db.journalBatch.create({
                batchNumber,
                referenceType: batchData.referenceType,
                referenceId: batchData.referenceId || null,
                description: batchData.description || null,
                transactionDate: batchData.transactionDate || new Date(),
                totalDebit,
                totalCredit,
                isBalanced: true,
                isPosted: true,
                createdBy: batchData.createdBy || null
            }, { transaction });

            // Create entries
            const entries = [];
            for (const entry of batchData.entries) {
                const ledgerEntry = await db.ledgerEntry.create({
                    batchId: batch.id,
                    accountId: entry.accountId,
                    debit: Number(entry.debit) || 0,
                    credit: Number(entry.credit) || 0,
                    narration: entry.narration || null
                }, { transaction });
                entries.push(ledgerEntry);
            }

            if (shouldCommit) {
                await transaction.commit();
            }

            return { batch, entries };
        } catch (error) {
            if (shouldCommit) {
                await transaction.rollback();
            }
            throw error;
        }
    }

    /**
     * Reverse a journal batch
     */
    async reverseJournalBatch(batchId, reason) {
        const db = this.db;
        const transaction = await db.sequelize.transaction();

        try {
            const originalBatch = await db.journalBatch.findByPk(batchId, {
                include: [{ model: db.ledgerEntry, as: 'entries' }],
                transaction
            });

            if (!originalBatch) {
                throw new Error('Batch not found');
            }

            if (originalBatch.isReversed) {
                throw new Error('Batch is already reversed');
            }

            // Create reversal entries (swap debit/credit)
            const reversalEntries = originalBatch.entries.map(entry => ({
                accountId: entry.accountId,
                debit: entry.credit,  // Swap
                credit: entry.debit,  // Swap
                narration: `Reversal: ${entry.narration || ''}`
            }));

            // Create reversal batch
            const reversalBatch = await this.createJournalBatch({
                referenceType: 'ADJUSTMENT',
                referenceId: originalBatch.referenceId,
                description: `Reversal of ${originalBatch.batchNumber}: ${reason}`,
                transactionDate: new Date(),
                entries: reversalEntries
            }, transaction);

            // Mark original as reversed
            await originalBatch.update({
                isReversed: true,
                reversedBatchId: reversalBatch.batch.id
            }, { transaction });

            await transaction.commit();
            return reversalBatch;
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    // ==================== BALANCE CALCULATIONS ====================

    /**
     * Get account balance (NEVER STORED - always computed)
     */
    async getAccountBalance(accountId, asOfDate = null) {
        const db = this.db;
        
        let whereClause = `le."accountId" = :accountId AND jb."isPosted" = true AND jb."isReversed" = false`;
        const replacements = { accountId };
        
        if (asOfDate) {
            whereClause += ` AND jb."transactionDate" <= :asOfDate`;
            replacements.asOfDate = asOfDate;
        }

        const result = await db.sequelize.query(`
            SELECT 
                COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0) as balance,
                COALESCE(SUM(le.debit), 0) as totalDebit,
                COALESCE(SUM(le.credit), 0) as totalCredit
            FROM ledger_entries le
            INNER JOIN journal_batches jb ON le."batchId" = jb.id
            WHERE ${whereClause}
        `, {
            replacements,
            type: db.Sequelize.QueryTypes.SELECT
        });

        return {
            balance: Number(result[0]?.balance) || 0,
            totalDebit: Number(result[0]?.totalDebit) || 0,
            totalCredit: Number(result[0]?.totalCredit) || 0
        };
    }

    /**
     * Get customer balance from ledger
     */
    async getCustomerLedgerBalance(customerId, asOfDate = null) {
        const account = await this.db.account.findOne({
            where: { partyId: customerId, partyType: 'customer' }
        });

        if (!account) {
            return { balance: 0, totalDebit: 0, totalCredit: 0, hasLedgerAccount: false };
        }

        const balanceData = await this.getAccountBalance(account.id, asOfDate);
        return { ...balanceData, hasLedgerAccount: true, accountId: account.id };
    }

    /**
     * Get supplier balance from ledger
     */
    async getSupplierLedgerBalance(supplierId, asOfDate = null) {
        const account = await this.db.account.findOne({
            where: { partyId: supplierId, partyType: 'supplier' }
        });

        if (!account) {
            return { balance: 0, totalDebit: 0, totalCredit: 0, hasLedgerAccount: false };
        }

        const balanceData = await this.getAccountBalance(account.id, asOfDate);
        // For liability accounts, positive balance means we owe money
        return { 
            ...balanceData, 
            balance: -balanceData.balance, // Invert for display
            hasLedgerAccount: true, 
            accountId: account.id 
        };
    }

    // ==================== REPORTS ====================

    /**
     * Trial Balance - Total Debits must equal Total Credits
     */
    async getTrialBalance(asOfDate = null) {
        const db = this.db;
        
        let dateFilter = '';
        const replacements = {};
        if (asOfDate) {
            dateFilter = `AND jb."transactionDate" <= :asOfDate`;
            replacements.asOfDate = asOfDate;
        }

        const accounts = await db.sequelize.query(`
            SELECT 
                a.id,
                a.code,
                a.name,
                a.type,
                COALESCE(SUM(le.debit), 0) as "totalDebit",
                COALESCE(SUM(le.credit), 0) as "totalCredit",
                COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0) as balance
            FROM accounts a
            LEFT JOIN ledger_entries le ON a.id = le."accountId"
            LEFT JOIN journal_batches jb ON le."batchId" = jb.id AND jb."isPosted" = true AND jb."isReversed" = false ${dateFilter}
            WHERE a."isActive" = true
            GROUP BY a.id, a.code, a.name, a.type
            HAVING COALESCE(SUM(le.debit), 0) != 0 OR COALESCE(SUM(le.credit), 0) != 0
            ORDER BY a.code
        `, {
            replacements,
            type: db.Sequelize.QueryTypes.SELECT
        });

        const totals = accounts.reduce((acc, row) => ({
            totalDebit: acc.totalDebit + Number(row.totalDebit),
            totalCredit: acc.totalCredit + Number(row.totalCredit)
        }), { totalDebit: 0, totalCredit: 0 });

        return {
            accounts,
            totals,
            isBalanced: Math.abs(totals.totalDebit - totals.totalCredit) < 0.01,
            asOfDate: asOfDate || new Date().toISOString().slice(0, 10)
        };
    }

    /**
     * Profit & Loss Statement
     */
    async getProfitAndLoss(fromDate, toDate) {
        const db = this.db;
        
        const incomeAccounts = await db.sequelize.query(`
            SELECT 
                a.id, a.code, a.name,
                COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0) as amount
            FROM accounts a
            LEFT JOIN ledger_entries le ON a.id = le."accountId"
            LEFT JOIN journal_batches jb ON le."batchId" = jb.id 
                AND jb."isPosted" = true 
                AND jb."isReversed" = false
                AND jb."transactionDate" BETWEEN :fromDate AND :toDate
            WHERE a.type = 'INCOME' AND a."isActive" = true
            GROUP BY a.id, a.code, a.name
            HAVING COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0) != 0
            ORDER BY a.code
        `, {
            replacements: { fromDate, toDate },
            type: db.Sequelize.QueryTypes.SELECT
        });

        const expenseAccounts = await db.sequelize.query(`
            SELECT 
                a.id, a.code, a.name,
                COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0) as amount
            FROM accounts a
            LEFT JOIN ledger_entries le ON a.id = le."accountId"
            LEFT JOIN journal_batches jb ON le."batchId" = jb.id 
                AND jb."isPosted" = true 
                AND jb."isReversed" = false
                AND jb."transactionDate" BETWEEN :fromDate AND :toDate
            WHERE a.type = 'EXPENSE' AND a."isActive" = true
            GROUP BY a.id, a.code, a.name
            HAVING COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0) != 0
            ORDER BY a.code
        `, {
            replacements: { fromDate, toDate },
            type: db.Sequelize.QueryTypes.SELECT
        });

        const totalIncome = incomeAccounts.reduce((sum, acc) => sum + Number(acc.amount), 0);
        const totalExpenses = expenseAccounts.reduce((sum, acc) => sum + Number(acc.amount), 0);
        const netProfit = totalIncome - totalExpenses;

        return {
            income: { accounts: incomeAccounts, total: totalIncome },
            expenses: { accounts: expenseAccounts, total: totalExpenses },
            netProfit,
            period: { fromDate, toDate }
        };
    }

    /**
     * Balance Sheet
     */
    async getBalanceSheet(asOfDate = null) {
        const db = this.db;
        const dateFilter = asOfDate ? `AND jb."transactionDate" <= :asOfDate` : '';
        const replacements = asOfDate ? { asOfDate } : {};

        const getAccountsByType = async (type, balanceFormula) => {
            return await db.sequelize.query(`
                SELECT 
                    a.id, a.code, a.name,
                    ${balanceFormula} as balance
                FROM accounts a
                LEFT JOIN ledger_entries le ON a.id = le."accountId"
                LEFT JOIN journal_batches jb ON le."batchId" = jb.id 
                    AND jb."isPosted" = true 
                    AND jb."isReversed" = false
                    ${dateFilter}
                WHERE a.type = '${type}' AND a."isActive" = true
                GROUP BY a.id, a.code, a.name
                HAVING ${balanceFormula} != 0
                ORDER BY a.code
            `, {
                replacements,
                type: db.Sequelize.QueryTypes.SELECT
            });
        };

        const assets = await getAccountsByType('ASSET', 'COALESCE(SUM(le.debit), 0) - COALESCE(SUM(le.credit), 0)');
        const liabilities = await getAccountsByType('LIABILITY', 'COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0)');
        const equity = await getAccountsByType('EQUITY', 'COALESCE(SUM(le.credit), 0) - COALESCE(SUM(le.debit), 0)');

        const totalAssets = assets.reduce((sum, acc) => sum + Number(acc.balance), 0);
        const totalLiabilities = liabilities.reduce((sum, acc) => sum + Number(acc.balance), 0);
        const totalEquity = equity.reduce((sum, acc) => sum + Number(acc.balance), 0);

        return {
            assets: { accounts: assets, total: totalAssets },
            liabilities: { accounts: liabilities, total: totalLiabilities },
            equity: { accounts: equity, total: totalEquity },
            isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
            asOfDate: asOfDate || new Date().toISOString().slice(0, 10)
        };
    }

    /**
     * Account Ledger - All transactions for an account
     */
    async getAccountLedger(accountId, fromDate = null, toDate = null) {
        const db = this.db;
        
        let dateFilter = '';
        const replacements = { accountId };
        if (fromDate) {
            dateFilter += ` AND jb."transactionDate" >= :fromDate`;
            replacements.fromDate = fromDate;
        }
        if (toDate) {
            dateFilter += ` AND jb."transactionDate" <= :toDate`;
            replacements.toDate = toDate;
        }

        const account = await db.account.findByPk(accountId);
        if (!account) {
            throw new Error('Account not found');
        }

        const entries = await db.sequelize.query(`
            SELECT 
                le.id,
                le.debit,
                le.credit,
                le.narration,
                le."createdAt",
                jb.id as "batchId",
                jb."batchNumber",
                jb."referenceType",
                jb."transactionDate",
                jb.description
            FROM ledger_entries le
            INNER JOIN journal_batches jb ON le."batchId" = jb.id
            WHERE le."accountId" = :accountId 
                AND jb."isPosted" = true 
                AND jb."isReversed" = false
                ${dateFilter}
            ORDER BY jb."transactionDate" ASC, le."createdAt" ASC
        `, {
            replacements,
            type: db.Sequelize.QueryTypes.SELECT
        });

        // Calculate running balance
        let runningBalance = 0;
        const entriesWithBalance = entries.map(entry => {
            runningBalance += Number(entry.debit) - Number(entry.credit);
            return { ...entry, runningBalance };
        });

        return {
            account,
            entries: entriesWithBalance,
            closingBalance: runningBalance
        };
    }
}

module.exports = LedgerService;
