const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controller/budget');

router.post('/budgets',          authenticate, authorize('admin'), ctrl.createBudget);
router.get('/budgets',           authenticate, ctrl.getBudgets);
router.get('/budgets/variance',  authenticate, ctrl.getBudgetVariance);

module.exports = router;
