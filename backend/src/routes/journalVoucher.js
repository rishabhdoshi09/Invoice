const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controller/journalVoucher');

router.post('/journal-vouchers',            authenticate, authorize('admin'), ctrl.createJournalVoucher);
router.get('/journal-vouchers',             authenticate, ctrl.getJournalVouchers);
router.get('/journal-vouchers/:id',         authenticate, ctrl.getJournalVoucher);
router.delete('/journal-vouchers/:id',      authenticate, authorize('admin'), ctrl.deleteJournalVoucher);

module.exports = router;
