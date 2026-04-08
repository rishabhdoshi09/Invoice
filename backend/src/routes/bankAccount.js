const { authenticate, authorize } = require('../middleware/auth');
const { makeFinancialWriteGuard } = require('../middleware/financialGuard');
const ctrl = require('../controller/bankAccount');
const db = require('../models');

const financialWriteGuard = makeFinancialWriteGuard(db);

module.exports = (router) => {
    router.get('/bank-accounts',                              authenticate, ctrl.getAll);
    router.post('/bank-accounts',                             authenticate, authorize('admin'), financialWriteGuard, ctrl.create);
    router.put('/bank-accounts/:id',                          authenticate, authorize('admin'), financialWriteGuard, ctrl.update);
    // import-statement writes to bank_statement_lines and may trigger ledger matching — block during HALT
    router.post('/bank-accounts/import-statement',            authenticate, authorize('admin'), financialWriteGuard, ctrl.importStatement);
    router.get('/bank-accounts/:bankAccountId/reconciliation',authenticate, ctrl.getReconciliation);
    // match-statement posts ledger entries — block during HALT
    router.post('/bank-accounts/match-statement',             authenticate, authorize('admin'), financialWriteGuard, ctrl.matchStatement);
};
