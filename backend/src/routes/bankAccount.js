const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controller/bankAccount');

router.get('/bank-accounts',                        authenticate, ctrl.getAll);
router.post('/bank-accounts',                       authenticate, authorize('admin'), ctrl.create);
router.put('/bank-accounts/:id',                    authenticate, authorize('admin'), ctrl.update);
router.post('/bank-accounts/import-statement',      authenticate, authorize('admin'), ctrl.importStatement);
router.get('/bank-accounts/:bankAccountId/reconciliation', authenticate, ctrl.getReconciliation);
router.post('/bank-accounts/match-statement',       authenticate, authorize('admin'), ctrl.matchStatement);

module.exports = router;
