const express = require('express');
const router = express.Router();
const ledgerController = require('../controller/ledger');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// ==================== ACCOUNTS ====================
router.post('/accounts/initialize', authorize('admin'), ledgerController.initializeAccounts);
router.get('/accounts', ledgerController.listAccounts);
router.post('/accounts', authorize('admin'), ledgerController.createAccount);
router.get('/accounts/:id', ledgerController.getAccount);
router.get('/accounts/:id/balance', ledgerController.getAccountBalance);
router.get('/accounts/:id/ledger', ledgerController.getAccountLedger);

// ==================== JOURNAL BATCHES ====================
router.get('/journal-batches', ledgerController.listJournalBatches);
router.post('/journal-batches', ledgerController.createJournalBatch);
router.get('/journal-batches/:id', ledgerController.getJournalBatch);
router.post('/journal-batches/:id/reverse', authorize('admin'), ledgerController.reverseJournalBatch);

// ==================== REPORTS ====================
router.get('/reports/trial-balance', ledgerController.getTrialBalance);
router.get('/reports/profit-loss', ledgerController.getProfitAndLoss);
router.get('/reports/balance-sheet', ledgerController.getBalanceSheet);

// ==================== PARTY BALANCES ====================
router.get('/customers/:customerId/ledger-balance', ledgerController.getCustomerLedgerBalance);
router.get('/suppliers/:supplierId/ledger-balance', ledgerController.getSupplierLedgerBalance);

// ==================== MIGRATION ====================
router.post('/migration/run', authorize('admin'), ledgerController.runMigration);
router.get('/migration/reconciliation', authorize('admin'), ledgerController.getReconciliationReport);
router.delete('/migration/clear', authorize('admin'), ledgerController.clearMigration);

module.exports = router;
