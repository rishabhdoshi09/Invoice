const ledgerController = require('../controller/ledger');
const { authenticate, authorize } = require('../middleware/auth');

module.exports = (router) => {
    // ==================== ACCOUNTS ====================
    router.post('/ledger/accounts/initialize', authenticate, authorize('admin'), ledgerController.initializeAccounts);
    router.get('/ledger/accounts', authenticate, ledgerController.listAccounts);
    router.post('/ledger/accounts', authenticate, authorize('admin'), ledgerController.createAccount);
    router.get('/ledger/accounts/:id', authenticate, ledgerController.getAccount);
    router.get('/ledger/accounts/:id/balance', authenticate, ledgerController.getAccountBalance);
    router.get('/ledger/accounts/:id/ledger', authenticate, ledgerController.getAccountLedger);

    // ==================== JOURNAL BATCHES ====================
    router.get('/ledger/journal-batches', authenticate, ledgerController.listJournalBatches);
    router.post('/ledger/journal-batches', authenticate, ledgerController.createJournalBatch);
    router.get('/ledger/journal-batches/:id', authenticate, ledgerController.getJournalBatch);
    router.post('/ledger/journal-batches/:id/reverse', authenticate, authorize('admin'), ledgerController.reverseJournalBatch);

    // ==================== REPORTS ====================
    router.get('/ledger/reports/trial-balance', authenticate, ledgerController.getTrialBalance);
    router.get('/ledger/reports/profit-loss', authenticate, ledgerController.getProfitAndLoss);
    router.get('/ledger/reports/balance-sheet', authenticate, ledgerController.getBalanceSheet);

    // ==================== PARTY BALANCES ====================
    router.get('/ledger/customers/:customerId/balance', authenticate, ledgerController.getCustomerLedgerBalance);
    router.get('/ledger/suppliers/:supplierId/balance', authenticate, ledgerController.getSupplierLedgerBalance);

    // ==================== MIGRATION ====================
    router.post('/ledger/migration/run', authenticate, authorize('admin'), ledgerController.runMigration);
    router.get('/ledger/migration/reconciliation', authenticate, authorize('admin'), ledgerController.getReconciliationReport);
    router.delete('/ledger/migration/clear', authenticate, authorize('admin'), ledgerController.clearMigration);
};
