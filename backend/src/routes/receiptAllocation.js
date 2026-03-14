const Controller = require('../controller/receiptAllocation');
const { authenticate } = require('../middleware/auth');

module.exports = (router) => {
    // Allocate payment against invoice(s) — explicit user action
    router.post('/receipts/allocate', authenticate, Controller.allocateReceipt);

    // Get allocations for a payment
    router.get('/receipts/:paymentId/allocations', authenticate, Controller.getPaymentAllocations);

    // Get allocations for an invoice
    router.get('/invoices/:orderId/allocations', authenticate, Controller.getInvoiceAllocations);

    // Delete (reverse) an allocation
    router.delete('/receipts/allocations/:allocationId', authenticate, Controller.deleteAllocation);

    // Preview what undoing auto-reconciliation would change (READ-ONLY)
    router.get('/receipts/undo-auto-reconciliation/preview', authenticate, Controller.previewUndoAutoReconciliation);

    // Execute the undo — requires explicit user action with changedBy
    router.post('/receipts/undo-auto-reconciliation/execute', authenticate, Controller.executeUndoAutoReconciliation);

};
