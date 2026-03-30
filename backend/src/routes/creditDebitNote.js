const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controller/creditDebitNote');

router.post('/credit-notes',  authenticate, ctrl.createCreditNote);
router.get('/credit-notes',   authenticate, ctrl.getCreditNotes);
router.post('/debit-notes',   authenticate, ctrl.createDebitNote);
router.get('/debit-notes',    authenticate, ctrl.getDebitNotes);

module.exports = router;
