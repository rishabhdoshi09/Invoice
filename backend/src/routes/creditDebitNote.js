const { authenticate, canModify } = require('../middleware/auth');
const { makeFinancialWriteGuard } = require('../middleware/financialGuard');
const ctrl = require('../controller/creditDebitNote');
const db = require('../models');

const financialWriteGuard = makeFinancialWriteGuard(db);

module.exports = (router) => {
    router.post('/credit-notes', authenticate, canModify, financialWriteGuard, ctrl.createCreditNote);
    router.get('/credit-notes',  authenticate, ctrl.getCreditNotes);
    router.post('/debit-notes',  authenticate, canModify, financialWriteGuard, ctrl.createDebitNote);
    router.get('/debit-notes',   authenticate, ctrl.getDebitNotes);
};
