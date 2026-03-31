const { authenticate } = require('../middleware/auth');
const ctrl = require('../controller/creditDebitNote');

module.exports = (router) => {
    router.post('/credit-notes', authenticate, ctrl.createCreditNote);
    router.get('/credit-notes',  authenticate, ctrl.getCreditNotes);
    router.post('/debit-notes',  authenticate, ctrl.createDebitNote);
    router.get('/debit-notes',   authenticate, ctrl.getDebitNotes);
};
