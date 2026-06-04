'use strict';

/**
 * realTimeLedger.js — thin adapter over AccountingEngine
 *
 * All controllers continue to import from this file.
 * Every function delegates to the canonical AccountingEngine,
 * so there is one source of truth for all DR/CR logic.
 */

const ae = require('./accountingEngine');

// ── Sales invoice ────────────────────────────────────────────────────────
const postInvoiceToLedger           = (order, tx)   => ae.postSalesInvoice(order, tx);
const postInvoiceCashReceiptToLedger = (order, tx)  => ae.postCashReceiptForInvoice(order, tx);

// ── Customer receipt ─────────────────────────────────────────────────────
const postPaymentToLedger = (payment, _customerId, _customerName, tx) =>
    ae.postCustomerReceipt(payment, tx);

// ── Purchase bill ────────────────────────────────────────────────────────
const postPurchaseToLedger = (purchase, tx) => ae.postPurchaseBill(purchase, tx);

// ── Supplier payment ─────────────────────────────────────────────────────
const postSupplierPaymentToLedger = (payment, supplierId, supplierName, tx) =>
    ae.postSupplierPayment(payment, supplierId, supplierName, tx);

// ── Payment-status toggle ────────────────────────────────────────────────
// toggleSeq MUST be the atomically incremented paymentToggleSequence value
// fetched from the locked order row inside the caller's transaction.
const postPaymentStatusToggleToLedger = (order, oldStatus, newStatus, changedBy, tx, toggleSeq) =>
    ae.postPaymentStatusToggle(order, oldStatus, newStatus, changedBy, tx, toggleSeq);

// ── Reversals ────────────────────────────────────────────────────────────
const reverseInvoiceLedger  = (order, tx)   => ae.reverseInvoice(order, tx);
const reversePaymentLedger  = (payment, tx) => ae.reversePayment(payment, tx);
const reversePurchaseLedger = (purchase, tx) => ae.reversePurchase(purchase, tx);

module.exports = {
    postInvoiceToLedger,
    postInvoiceCashReceiptToLedger,
    postPaymentToLedger,
    postPurchaseToLedger,
    postSupplierPaymentToLedger,
    postPaymentStatusToggleToLedger,
    reverseInvoiceLedger,
    reversePaymentLedger,
    reversePurchaseLedger
};
