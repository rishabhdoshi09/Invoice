const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controller/financialReports');

// Core financial statements (Tally Reports)
router.get('/financial/trial-balance',     authenticate, ctrl.getTrialBalance);
router.get('/financial/profit-loss',       authenticate, ctrl.getProfitAndLoss);
router.get('/financial/balance-sheet',     authenticate, ctrl.getBalanceSheet);
router.get('/financial/daybook',           authenticate, ctrl.getDaybook);
router.get('/financial/cash-book',         authenticate, ctrl.getCashBook);
router.get('/financial/ledger/:accountId', authenticate, ctrl.getLedgerStatement);

// Ageing reports
router.get('/financial/receivables-ageing', authenticate, ctrl.getReceivablesAgeing);
router.get('/financial/payables-ageing',    authenticate, ctrl.getPayablesAgeing);

// Registers
router.get('/financial/sales-register',    authenticate, ctrl.getSalesRegister);
router.get('/financial/purchase-register', authenticate, ctrl.getPurchaseRegister);
router.get('/financial/stock-summary',     authenticate, ctrl.getStockSummary);
router.get('/financial/ratio-analysis',    authenticate, ctrl.getRatioAnalysis);

module.exports = router;
