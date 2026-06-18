const { authenticate, authorize } = require('../middleware/auth');
const { makeFinancialWriteGuard } = require('../middleware/financialGuard');
const ctrl = require('../controller/journalVoucher');
const db = require('../models');

const financialWriteGuard = makeFinancialWriteGuard(db);

module.exports = (router) => {
    router.post('/journal-vouchers',       authenticate, authorize('admin'), financialWriteGuard, ctrl.createJournalVoucher);
    router.get('/journal-vouchers',        authenticate, ctrl.getJournalVouchers);
    router.get('/journal-vouchers/:id',    authenticate, ctrl.getJournalVoucher);
    router.delete('/journal-vouchers/:id', authenticate, authorize('admin'), financialWriteGuard, ctrl.deleteJournalVoucher);
};
