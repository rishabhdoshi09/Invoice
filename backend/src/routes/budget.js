const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controller/budget');

module.exports = (router) => {
    router.post('/budgets',         authenticate, authorize('admin'), ctrl.createBudget);
    router.get('/budgets',          authenticate, ctrl.getBudgets);
    router.get('/budgets/variance', authenticate, ctrl.getBudgetVariance);
};
