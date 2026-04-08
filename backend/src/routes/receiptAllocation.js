const Controller = require('../controller/receiptAllocation');
const { authenticate } = require('../middleware/auth');
const { makeFinancialWriteGuard } = require('../middleware/financialGuard');
const db = require('../models');

const financialWriteGuard = makeFinancialWriteGuard(db);

module.exports = (router) => {
    // Allocate payment against invoice(s) — financial write, block during HALT
    router.post('/receipts/allocate', authenticate, financialWriteGuard, Controller.allocateReceipt);

    // Get allocations for a payment
    router.get('/receipts/:paymentId/allocations', authenticate, Controller.getPaymentAllocations);

    // Get allocations for an invoice
    router.get('/invoices/:orderId/allocations', authenticate, Controller.getInvoiceAllocations);

    // Delete (reverse) an allocation — financial write, block during HALT
    router.delete('/receipts/allocations/:allocationId', authenticate, financialWriteGuard, Controller.deleteAllocation);

    // Preview what undoing auto-reconciliation would change (READ-ONLY)
    router.get('/receipts/undo-auto-reconciliation/preview', authenticate, Controller.previewUndoAutoReconciliation);

    // Execute the undo — financial write, block during HALT
    router.post('/receipts/undo-auto-reconciliation/execute', authenticate, financialWriteGuard, Controller.executeUndoAutoReconciliation);
};
