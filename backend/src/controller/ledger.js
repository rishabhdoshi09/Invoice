const db = require('../models');
const LedgerService = require('../services/ledgerService');
const LedgerMigrationService = require('../services/ledgerMigrationService');

const ledgerService = new LedgerService(db);
const migrationService = new LedgerMigrationService(db);

module.exports = {
    // ==================== ACCOUNTS ====================
    
    /**
     * Initialize chart of accounts
     */
    initializeAccounts: async (req, res) => {
        try {
            const result = await ledgerService.initializeChartOfAccounts();
            return res.json({ status: 200, message: 'Chart of accounts initialized', data: result });
        } catch (error) {
            console.error('Error initializing accounts:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * List all accounts
     */
    listAccounts: async (req, res) => {
        try {
            const { type, isActive } = req.query;
            const accounts = await ledgerService.listAccounts({ 
                type, 
                isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined 
            });
            return res.json({ status: 200, data: accounts });
        } catch (error) {
            console.error('Error listing accounts:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Get account by ID
     */
    getAccount: async (req, res) => {
        try {
            const account = await db.account.findByPk(req.params.id, {
                include: [
                    { model: db.account, as: 'parent', attributes: ['id', 'code', 'name'] },
                    { model: db.account, as: 'children', attributes: ['id', 'code', 'name'] }
                ]
            });
            if (!account) {
                return res.status(404).json({ status: 404, message: 'Account not found' });
            }
            return res.json({ status: 200, data: account });
        } catch (error) {
            console.error('Error getting account:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Create a new account
     */
    createAccount: async (req, res) => {
        try {
            const { code, name, type, subType, parentId, description } = req.body;
            
            // Validate required fields
            if (!code || !name || !type) {
                return res.status(400).json({ status: 400, message: 'Code, name, and type are required' });
            }

            // Check if code already exists
            const existing = await db.account.findOne({ where: { code } });
            if (existing) {
                return res.status(400).json({ status: 400, message: 'Account code already exists' });
            }

            const account = await db.account.create({
                code, name, type, subType, parentId, description
            });

            return res.json({ status: 200, message: 'Account created', data: account });
        } catch (error) {
            console.error('Error creating account:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Get account balance
     */
    getAccountBalance: async (req, res) => {
        try {
            const { id } = req.params;
            const { asOfDate } = req.query;
            
            const balance = await ledgerService.getAccountBalance(id, asOfDate);
            const account = await db.account.findByPk(id, { attributes: ['id', 'code', 'name', 'type'] });
            
            return res.json({ 
                status: 200, 
                data: { 
                    account,
                    ...balance,
                    asOfDate: asOfDate || new Date().toISOString().slice(0, 10)
                }
            });
        } catch (error) {
            console.error('Error getting account balance:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Get account ledger (all transactions)
     */
    getAccountLedger: async (req, res) => {
        try {
            const { id } = req.params;
            const { fromDate, toDate } = req.query;
            
            const ledger = await ledgerService.getAccountLedger(id, fromDate, toDate);
            return res.json({ status: 200, data: ledger });
        } catch (error) {
            console.error('Error getting account ledger:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    // ==================== JOURNAL BATCHES ====================

    /**
     * Create journal batch
     */
    createJournalBatch: async (req, res) => {
        try {
            const { referenceType, referenceId, description, transactionDate, entries } = req.body;
            
            if (!referenceType || !entries || entries.length < 2) {
                return res.status(400).json({ 
                    status: 400, 
                    message: 'Reference type and at least 2 entries are required' 
                });
            }

            const result = await ledgerService.createJournalBatch({
                referenceType,
                referenceId,
                description,
                transactionDate: transactionDate || new Date(),
                entries,
                createdBy: req.user?.id
            });

            return res.json({ status: 200, message: 'Journal batch created', data: result });
        } catch (error) {
            console.error('Error creating journal batch:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * List journal batches
     */
    listJournalBatches: async (req, res) => {
        try {
            const { referenceType, fromDate, toDate, page = 1, limit = 50 } = req.query;
            
            const where = {};
            if (referenceType) where.referenceType = referenceType;
            if (fromDate || toDate) {
                where.transactionDate = {};
                if (fromDate) where.transactionDate[db.Sequelize.Op.gte] = fromDate;
                if (toDate) where.transactionDate[db.Sequelize.Op.lte] = toDate;
            }

            const batches = await db.journalBatch.findAndCountAll({
                where,
                include: [{
                    model: db.ledgerEntry,
                    as: 'entries',
                    include: [{ model: db.account, as: 'account', attributes: ['id', 'code', 'name'] }]
                }],
                order: [['transactionDate', 'DESC'], ['createdAt', 'DESC']],
                limit: parseInt(limit),
                offset: (parseInt(page) - 1) * parseInt(limit)
            });

            return res.json({ 
                status: 200, 
                data: {
                    batches: batches.rows,
                    total: batches.count,
                    page: parseInt(page),
                    limit: parseInt(limit)
                }
            });
        } catch (error) {
            console.error('Error listing journal batches:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Get journal batch by ID
     */
    getJournalBatch: async (req, res) => {
        try {
            const batch = await db.journalBatch.findByPk(req.params.id, {
                include: [{
                    model: db.ledgerEntry,
                    as: 'entries',
                    include: [{ model: db.account, as: 'account', attributes: ['id', 'code', 'name', 'type'] }]
                }]
            });

            if (!batch) {
                return res.status(404).json({ status: 404, message: 'Batch not found' });
            }

            return res.json({ status: 200, data: batch });
        } catch (error) {
            console.error('Error getting journal batch:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Reverse journal batch
     */
    reverseJournalBatch: async (req, res) => {
        try {
            const { id } = req.params;
            const { reason } = req.body;

            const result = await ledgerService.reverseJournalBatch(id, reason || 'Manual reversal');
            return res.json({ status: 200, message: 'Batch reversed', data: result });
        } catch (error) {
            console.error('Error reversing journal batch:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    // ==================== REPORTS ====================

    /**
     * Trial Balance
     */
    getTrialBalance: async (req, res) => {
        try {
            const { asOfDate } = req.query;
            const trialBalance = await ledgerService.getTrialBalance(asOfDate);
            return res.json({ status: 200, data: trialBalance });
        } catch (error) {
            console.error('Error getting trial balance:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Profit & Loss Statement
     */
    getProfitAndLoss: async (req, res) => {
        try {
            const { fromDate, toDate } = req.query;
            
            if (!fromDate || !toDate) {
                return res.status(400).json({ status: 400, message: 'fromDate and toDate are required' });
            }

            const pnl = await ledgerService.getProfitAndLoss(fromDate, toDate);
            return res.json({ status: 200, data: pnl });
        } catch (error) {
            console.error('Error getting P&L:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Balance Sheet
     */
    getBalanceSheet: async (req, res) => {
        try {
            const { asOfDate } = req.query;
            const balanceSheet = await ledgerService.getBalanceSheet(asOfDate);
            return res.json({ status: 200, data: balanceSheet });
        } catch (error) {
            console.error('Error getting balance sheet:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    // ==================== PARTY BALANCES ====================

    /**
     * Get customer ledger balance
     */
    getCustomerLedgerBalance: async (req, res) => {
        try {
            const { customerId } = req.params;
            const { asOfDate } = req.query;
            
            const balance = await ledgerService.getCustomerLedgerBalance(customerId, asOfDate);
            return res.json({ status: 200, data: balance });
        } catch (error) {
            console.error('Error getting customer ledger balance:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Get supplier ledger balance
     */
    getSupplierLedgerBalance: async (req, res) => {
        try {
            const { supplierId } = req.params;
            const { asOfDate } = req.query;
            
            const balance = await ledgerService.getSupplierLedgerBalance(supplierId, asOfDate);
            return res.json({ status: 200, data: balance });
        } catch (error) {
            console.error('Error getting supplier ledger balance:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    // ==================== MIGRATION ====================

    /**
     * Health check - system-wide ledger balance verification
     */
    healthCheck: async (req, res) => {
        try {
            const result = await ledgerService.healthCheck();
            return res.json({ status: 200, data: result });
        } catch (error) {
            console.error('Error running health check:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Run full migration
     */
    runMigration: async (req, res) => {
        try {
            console.log('Starting ledger migration...');
            const results = await migrationService.runFullMigration();
            return res.json({ status: 200, message: 'Migration complete', data: results });
        } catch (error) {
            console.error('Error running migration:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Daily drift check — lightweight read-only comparison
     * between old system and ledger for early mismatch detection.
     */
    dailyDriftCheck: async (req, res) => {
        try {
            const report = await ledgerService.dailyDriftCheck();
            const status = report.status;
            if (status === 'DRIFT_DETECTED') {
                console.log(`[LEDGER] DRIFT_DETECTED at ${report.timestamp} — ${report.customerDrift.length} customer(s) drifted, sales match=${report.systemTotals.sales.isMatched}, payments match=${report.systemTotals.payments.isMatched}`);
            } else {
                console.log(`[LEDGER] Daily drift check OK at ${report.timestamp}`);
            }
            return res.json({ status: 200, data: report });
        } catch (error) {
            console.error('[LEDGER] Drift check error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * SAFE MODE: Full read-only reconciliation validation
     */
    safeReconciliation: async (req, res) => {
        try {
            const report = await migrationService.runSafeReconciliation();
            return res.json({ status: 200, data: report });
        } catch (error) {
            console.error('Error running safe reconciliation:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Get migration status / reconciliation report
     */
    getReconciliationReport: async (req, res) => {
        try {
            const report = await migrationService.runReconciliation();
            return res.json({ status: 200, data: report });
        } catch (error) {
            console.error('Error getting reconciliation report:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Clear migration data
     */
    clearMigration: async (req, res) => {
        try {
            const result = await migrationService.clearMigrationData();
            return res.json({ status: 200, message: 'Migration data cleared', data: result });
        } catch (error) {
            console.error('Error clearing migration:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    }
};
