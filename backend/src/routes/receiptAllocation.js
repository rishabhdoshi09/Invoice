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

    // Backfill receipt_allocations from existing payment-order data
    router.post('/receipts/backfill-allocations', authenticate, Controller.backfillAllocations);
};
