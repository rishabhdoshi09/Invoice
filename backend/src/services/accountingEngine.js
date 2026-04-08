'use strict';

/**
 * AccountingEngine — Tally-style double-entry bookkeeping engine
 *
 * Every business event produces balanced journal entries (DR = CR).
 * All public methods REQUIRE an active Sequelize transaction.
 * If any posting fails the calling transaction rolls back entirely.
 *
 * TRANSACTION FLOWS
 * ─────────────────
 * Sales Invoice     DR Customer A/R (total)
 *                   CR Sales Revenue (subTotal - discount)
 *                   CR CGST Payable  (cgst)
 *                   CR SGST Payable  (sgst)
 *                   CR IGST Payable  (igst)
 *
 * Cash at Invoice   DR Cash / Bank (paidAmount)
 *                   CR Customer A/R (paidAmount)
 *
 * Customer Receipt  DR Cash / Bank (amount)
 *                   CR Customer A/R (amount)
 *
 * Purchase Bill     DR Stock / COGS (subTotal - discount)
 *                   DR GST Input Credit CGST (cgst)
 *                   DR GST Input Credit SGST (sgst)
 *                   DR GST Input Credit IGST (igst)
 *                   CR Supplier A/P (total)
 *
 * Supplier Payment  DR Supplier A/P (amount)
 *                   CR Cash / Bank  (amount)
 *
 * Daily Expense     DR Expense Account (amount)
 *                   CR Cash / Bank     (amount)
 *
 * Reversal          Swap DR↔CR of every line in the original batch
 */

const db = require('../models');
const LedgerService = require('./ledgerService');

const ledgerService = new LedgerService(db);

// ─── account-code constants ───────────────────────────────────────────────
const CODE = {
    CASH:              '1100',
    BANK:              '1200',
    RECEIVABLE:        '1300',  // parent; individual sub-accounts under 1300-xxx
    INVENTORY:         '1400',
    PAYABLE:           '2100',  // parent; individual sub-accounts under 2100-xxx
    GST_PAYABLE:       '2200',  // parent for output GST
    CGST_PAYABLE:      '2201',
    SGST_PAYABLE:      '2202',
    IGST_PAYABLE:      '2203',
    GST_INPUT:         '1500',  // parent for input GST credit
    CGST_INPUT:        '1501',
    SGST_INPUT:        '1502',
    IGST_INPUT:        '1503',
    SALES:             '4100',
    COGS:              '5100',
    PURCHASE:          '5300',
    OPERATING_EXP:     '5200',
    // CR-ADVANCE: Customer advances are a liability — money received before an invoice
    // exists, or in excess of the current invoice total. Must be journaled as a
    // LIABILITY (not as negative A/R) so the balance sheet is correct.
    CUSTOMER_ADVANCES: '2300',
};

// ─── helper: get required account by code (throws if missing) ─────────────
async function _acct(code, transaction) {
    const acc = await db.account.findOne({ where: { code }, transaction });
    if (!acc) throw new Error(`[AccountingEngine] Account (${code}) not found. Run initializeChartOfAccounts() first.`);
    return acc;
}

// ─── helper: resolve cash-or-bank ledger account ──────────────────────────
async function _cashOrBank(bankAccountId, transaction) {
    if (bankAccountId) {
        const ba = await db.bankAccount.findByPk(bankAccountId, { transaction });
        if (ba && ba.ledgerAccountId) {
            const acc = await db.account.findByPk(ba.ledgerAccountId, { transaction });
            if (acc) return acc;
        }
    }
    return _acct(CODE.CASH, transaction);
}

// ─── helper: get or create party ledger account ───────────────────────────
async function _partyAccount(partyType, partyId, partyName, transaction) {
    if (partyType === 'customer') {
        return ledgerService.getOrCreateCustomerAccount(partyId, partyName, transaction);
    }
    if (partyType === 'supplier') {
        return ledgerService.getOrCreateSupplierAccount(partyId, partyName, transaction);
    }
    throw new Error(`[AccountingEngine] Unknown partyType: ${partyType}`);
}

// ─── helper: duplicate-posting guard ─────────────────────────────────────
async function _alreadyPosted(referenceType, referenceId, transaction) {
    const existing = await db.journalBatch.findOne({
        where: { referenceType, referenceId, isReversed: false },
        transaction
    });
    return existing || null;
}

// ─── helper: resolve transactionDate safely ───────────────────────────────
function _txDate(dateish) {
    if (!dateish) return new Date();
    if (dateish instanceof Date) return dateish;
    const d = new Date(dateish);
    return isNaN(d.getTime()) ? new Date() : d;
}

// ══════════════════════════════════════════════════════════════════════════
//  1. SALES INVOICE
//     DR Customer A/R (total)
//     CR Sales Revenue (net taxable)
//     CR CGST/SGST/IGST Payable
// ══════════════════════════════════════════════════════════════════════════
async function postSalesInvoice(order, transaction) {
    const dup = await _alreadyPosted('INVOICE', order.id, transaction);
    if (dup) {
        console.log(`[AE] SKIP: Invoice ${order.orderNumber} already posted (${dup.batchNumber})`);
        return { skipped: true, batchNumber: dup.batchNumber };
    }

    const total  = Number(order.total)   || 0;
    const cgst   = Number(order.cgst)    || 0;
    const sgst   = Number(order.sgst)    || 0;
    const igst   = Number(order.igst)    || 0;
    const taxTotal = cgst + sgst + igst;
    const netSales = +(total - taxTotal).toFixed(2);

    if (total <= 0) return { skipped: true, reason: 'zero_total' };

    const [customerAcct, salesAcct] = await Promise.all([
        _partyAccount('customer', order.customerId || null, order.customerName || 'Walk-in Customer', transaction),
        _acct(CODE.SALES, transaction)
    ]);

    const entries = [
        { accountId: customerAcct.id, debit: total,    credit: 0,        narration: `Invoice ${order.orderNumber}` },
        { accountId: salesAcct.id,    debit: 0,        credit: netSales, narration: `Sales: ${order.orderNumber}` }
    ];

    if (cgst > 0) {
        const a = await _acct(CODE.CGST_PAYABLE, transaction);
        entries.push({ accountId: a.id, debit: 0, credit: cgst, narration: `CGST: ${order.orderNumber}` });
    }
    if (sgst > 0) {
        const a = await _acct(CODE.SGST_PAYABLE, transaction);
        entries.push({ accountId: a.id, debit: 0, credit: sgst, narration: `SGST: ${order.orderNumber}` });
    }
    if (igst > 0) {
        const a = await _acct(CODE.IGST_PAYABLE, transaction);
        entries.push({ accountId: a.id, debit: 0, credit: igst, narration: `IGST: ${order.orderNumber}` });
    }

    const result = await ledgerService.createJournalBatch({
        referenceType: 'INVOICE',
        referenceId:   order.id,
        description:   `Invoice ${order.orderNumber} — ${order.customerName || 'Walk-in'}`,
        transactionDate: _txDate(order.orderDate || order.createdAt),
        entries
    }, transaction);

    console.log(`[AE] INVOICE ${order.orderNumber} → ${result.batch.batchNumber} (DR ${total}, CR Sales ${netSales} + GST ${taxTotal})`);
    return { posted: true, batchNumber: result.batch.batchNumber, batchId: result.batch.id };
}

// ══════════════════════════════════════════════════════════════════════════
//  2. CASH RECEIPT AT INVOICE (when order is created as partly/fully paid)
//
//  Normal case (no overpayment):
//     DR Cash / Bank (paidAmount)
//     CR Customer A/R (paidAmount)
//
//  Overpayment case (paidAmount > total) — CR-ADVANCE FIX:
//  Previously ALL of paidAmount was credited to A/R, making A/R go negative
//  (representing a liability on the wrong side of the balance sheet).
//  Now the excess is split to a proper liability account:
//     DR Cash / Bank    (paidAmount)
//     CR Customer A/R   (total)            — clears the receivable exactly
//     CR Customer Advances (paidAmount-total) — records the liability correctly
// ══════════════════════════════════════════════════════════════════════════
async function postCashReceiptForInvoice(order, transaction) {
    const paidAmount = Number(order.originalPaidAmount ?? order.paidAmount) || 0;
    if (paidAmount <= 0) return { skipped: true, reason: 'not_paid' };

    const dup = await _alreadyPosted('INVOICE_CASH', order.id, transaction);
    if (dup) {
        console.log(`[AE] SKIP: Invoice cash ${order.orderNumber} already posted (${dup.batchNumber})`);
        return { skipped: true, batchNumber: dup.batchNumber };
    }

    const total         = Number(order.total) || 0;
    const advanceAmount = +(Math.max(0, paidAmount - total)).toFixed(2);
    const arCredit      = +(Math.min(paidAmount, total)).toFixed(2);

    const [cashAcct, customerAcct] = await Promise.all([
        _cashOrBank(order.bankAccountId, transaction),
        _partyAccount('customer', order.customerId || null, order.customerName || 'Walk-in Customer', transaction)
    ]);

    const entries = [
        { accountId: cashAcct.id,     debit: paidAmount, credit: 0,        narration: `Cash: Invoice ${order.orderNumber}` },
        { accountId: customerAcct.id, debit: 0,          credit: arCredit, narration: `Cash: Invoice ${order.orderNumber}` }
    ];

    // CR-ADVANCE: Post the overpayment to Customer Advances (LIABILITY 2300).
    // This keeps A/R non-negative and properly reflects the money owed BACK to the customer.
    if (advanceAmount > 0) {
        const advanceAcct = await _acct(CODE.CUSTOMER_ADVANCES, transaction);
        entries.push({
            accountId: advanceAcct.id,
            debit:     0,
            credit:    advanceAmount,
            narration: `Customer Advance: Invoice ${order.orderNumber}`
        });
        console.log(`[AE] INVOICE_CASH ${order.orderNumber}: overpayment ₹${advanceAmount} → Customer Advances (2300)`);
    }

    const result = await ledgerService.createJournalBatch({
        referenceType:   'INVOICE_CASH',
        referenceId:     order.id,
        description:     `Cash received for Invoice ${order.orderNumber}`,
        transactionDate: _txDate(order.orderDate || order.createdAt),
        entries
    }, transaction);

    console.log(`[AE] INVOICE_CASH ${order.orderNumber} → ${result.batch.batchNumber} (DR Cash ${paidAmount}, CR A/R ${arCredit}${advanceAmount > 0 ? ` + Advance ${advanceAmount}` : ''})`);
    return { posted: true, batchNumber: result.batch.batchNumber, batchId: result.batch.id };
}

// ══════════════════════════════════════════════════════════════════════════
//  3. CUSTOMER RECEIPT (standalone payment record)
//     DR Cash / Bank (amount)
//     CR Customer A/R (amount)
// ══════════════════════════════════════════════════════════════════════════
async function postCustomerReceipt(payment, transaction) {
    if (payment.partyType !== 'customer') return { skipped: true, reason: 'not_customer' };

    const dup = await _alreadyPosted('PAYMENT', payment.id, transaction);
    if (dup) {
        console.log(`[AE] SKIP: Payment ${payment.paymentNumber} already posted (${dup.batchNumber})`);
        return { skipped: true, batchNumber: dup.batchNumber };
    }

    const amount = Number(payment.amount) || 0;
    if (amount <= 0) return { skipped: true, reason: 'zero_amount' };
    if (!payment.partyId) return { skipped: true, reason: 'no_customer_id' };

    const [cashAcct, customerAcct] = await Promise.all([
        _cashOrBank(payment.bankAccountId, transaction),
        _partyAccount('customer', payment.partyId, payment.partyName, transaction)
    ]);

    const result = await ledgerService.createJournalBatch({
        referenceType: 'PAYMENT',
        referenceId:   payment.id,
        description:   `Receipt ${payment.paymentNumber} — ${payment.partyName}`,
        transactionDate: _txDate(payment.paymentDate || payment.createdAt),
        entries: [
            { accountId: cashAcct.id,     debit: amount, credit: 0,      narration: `Receipt ${payment.paymentNumber}` },
            { accountId: customerAcct.id, debit: 0,      credit: amount, narration: `Receipt ${payment.paymentNumber}` }
        ]
    }, transaction);

    console.log(`[AE] RECEIPT ${payment.paymentNumber} → ${result.batch.batchNumber} (DR Cash ${amount}, CR Customer ${amount})`);
    return { posted: true, batchNumber: result.batch.batchNumber, batchId: result.batch.id };
}

// ══════════════════════════════════════════════════════════════════════════
//  4. PURCHASE BILL
//     DR Stock / COGS (net taxable value)
//     DR CGST Input Credit
//     DR SGST Input Credit
//     DR IGST Input Credit
//     CR Supplier A/P (total)
// ══════════════════════════════════════════════════════════════════════════
async function postPurchaseBill(purchase, transaction) {
    const dup = await _alreadyPosted('PURCHASE', purchase.id, transaction);
    if (dup) {
        console.log(`[AE] SKIP: Purchase ${purchase.billNumber} already posted (${dup.batchNumber})`);
        return { skipped: true, batchNumber: dup.batchNumber };
    }

    const total    = Number(purchase.total)  || 0;
    const cgst     = Number(purchase.cgst)   || 0;
    const sgst     = Number(purchase.sgst)   || 0;
    const igst     = Number(purchase.igst)   || 0;
    const taxTotal = cgst + sgst + igst;
    const netCost  = +(total - taxTotal).toFixed(2);

    if (total <= 0) return { skipped: true, reason: 'zero_total' };
    if (!purchase.supplierId) return { skipped: true, reason: 'no_supplier' };

    const [supplierAcct, purchaseAcct] = await Promise.all([
        _partyAccount('supplier', purchase.supplierId, purchase.supplierName || 'Unknown Supplier', transaction),
        _acct(CODE.PURCHASE, transaction)
    ]);

    const entries = [
        { accountId: purchaseAcct.id,  debit: netCost, credit: 0,     narration: `Purchase ${purchase.billNumber}` },
        { accountId: supplierAcct.id,  debit: 0,       credit: total, narration: `Purchase ${purchase.billNumber}` }
    ];

    if (cgst > 0) {
        const a = await _acct(CODE.CGST_INPUT, transaction);
        entries.push({ accountId: a.id, debit: cgst, credit: 0, narration: `CGST Input: ${purchase.billNumber}` });
    }
    if (sgst > 0) {
        const a = await _acct(CODE.SGST_INPUT, transaction);
        entries.push({ accountId: a.id, debit: sgst, credit: 0, narration: `SGST Input: ${purchase.billNumber}` });
    }
    if (igst > 0) {
        const a = await _acct(CODE.IGST_INPUT, transaction);
        entries.push({ accountId: a.id, debit: igst, credit: 0, narration: `IGST Input: ${purchase.billNumber}` });
    }

    const result = await ledgerService.createJournalBatch({
        referenceType: 'PURCHASE',
        referenceId:   purchase.id,
        description:   `Purchase ${purchase.billNumber} — ${purchase.supplierName}`,
        transactionDate: _txDate(purchase.billDate || purchase.createdAt),
        entries
    }, transaction);

    console.log(`[AE] PURCHASE ${purchase.billNumber} → ${result.batch.batchNumber} (DR Purchase ${netCost} + GST ${taxTotal}, CR Supplier ${total})`);
    return { posted: true, batchNumber: result.batch.batchNumber, batchId: result.batch.id };
}

// ══════════════════════════════════════════════════════════════════════════
//  5. SUPPLIER PAYMENT
//     DR Supplier A/P (amount)
//     CR Cash / Bank  (amount)
// ══════════════════════════════════════════════════════════════════════════
async function postSupplierPayment(payment, supplierId, supplierName, transaction) {
    const dup = await _alreadyPosted('PAYMENT', payment.id, transaction);
    if (dup) {
        console.log(`[AE] SKIP: Supplier Payment ${payment.paymentNumber} already posted (${dup.batchNumber})`);
        return { skipped: true, batchNumber: dup.batchNumber };
    }

    const amount = Number(payment.amount) || 0;
    if (amount <= 0) return { skipped: true, reason: 'zero_amount' };
    if (!supplierId) return { skipped: true, reason: 'no_supplier_id' };

    const [supplierAcct, cashAcct] = await Promise.all([
        _partyAccount('supplier', supplierId, supplierName || 'Unknown Supplier', transaction),
        _cashOrBank(payment.bankAccountId, transaction)
    ]);

    const result = await ledgerService.createJournalBatch({
        referenceType: 'PAYMENT',
        referenceId:   payment.id,
        description:   `Payment to ${supplierName} — ${payment.paymentNumber}`,
        transactionDate: _txDate(payment.paymentDate || payment.createdAt),
        entries: [
            { accountId: supplierAcct.id, debit: amount, credit: 0,      narration: `Payment ${payment.paymentNumber}` },
            { accountId: cashAcct.id,     debit: 0,      credit: amount, narration: `Payment ${payment.paymentNumber}` }
        ]
    }, transaction);

    console.log(`[AE] SUPPLIER_PMT ${payment.paymentNumber} → ${result.batch.batchNumber} (DR Supplier ${amount}, CR Cash ${amount})`);
    return { posted: true, batchNumber: result.batch.batchNumber, batchId: result.batch.id };
}

// ══════════════════════════════════════════════════════════════════════════
//  6. DAILY EXPENSE
//     DR Expense Account (amount)
//     CR Cash / Bank    (amount)
// ══════════════════════════════════════════════════════════════════════════
async function postExpense(expense, transaction) {
    const dup = await _alreadyPosted('EXPENSE', expense.id, transaction);
    if (dup) {
        console.log(`[AE] SKIP: Expense ${expense.id} already posted (${dup.batchNumber})`);
        return { skipped: true, batchNumber: dup.batchNumber };
    }

    const amount = Number(expense.amount) || 0;
    if (amount <= 0) return { skipped: true, reason: 'zero_amount' };

    // Use expenseAccountId if linked to a specific account, else fall back to Operating Expenses
    let expenseAcct;
    if (expense.expenseAccountId) {
        expenseAcct = await db.account.findByPk(expense.expenseAccountId, { transaction });
    }
    if (!expenseAcct) {
        expenseAcct = await _acct(CODE.OPERATING_EXP, transaction);
    }

    const cashAcct = await _cashOrBank(expense.bankAccountId, transaction);

    const result = await ledgerService.createJournalBatch({
        referenceType: 'EXPENSE',
        referenceId:   expense.id,
        description:   `Expense: ${expense.category} — ${expense.description || ''}`.trim().replace(/—\s*$/, ''),
        transactionDate: _txDate(expense.expenseDate || expense.date || expense.createdAt),
        entries: [
            { accountId: expenseAcct.id, debit: amount, credit: 0,      narration: expense.category || 'Expense' },
            { accountId: cashAcct.id,    debit: 0,      credit: amount, narration: expense.category || 'Expense' }
        ]
    }, transaction);

    console.log(`[AE] EXPENSE ${expense.id} → ${result.batch.batchNumber} (DR Expense ${amount}, CR Cash ${amount})`);
    return { posted: true, batchNumber: result.batch.batchNumber, batchId: result.batch.id };
}

// ══════════════════════════════════════════════════════════════════════════
//  7. PAYMENT STATUS TOGGLE (mark invoice paid/unpaid manually)
//     unpaid→paid:  DR Cash (dueAmount), CR Customer A/R (dueAmount)
//     paid→unpaid:  DR Customer A/R (dueAmount), CR Cash (dueAmount)
//
//  IDEMPOTENCY FIX (audit finding CR-TOGGLE):
//  Previous implementation used a direction-stamped referenceType
//  (PAYMENT_TOGGLE_UNPAID_PAID / PAYMENT_TOGGLE_PAID_UNPAID) with a
//  static referenceId = order.id.  On the 3rd toggle of the same
//  direction the dedup check found the existing batch and silently
//  skipped posting — leaving the ledger out of sync with the orders table.
//
//  Fix: the caller increments order.paymentToggleSequence atomically
//  BEFORE calling this function.  We embed the sequence in referenceId:
//    referenceType: 'PAYMENT_TOGGLE'
//    referenceId:   '<order-uuid>_<sequence>'
//  Each distinct toggle event is now guaranteed a unique referenceId.
//  A same-event retry (same sequence) is still deduplicated correctly.
// ══════════════════════════════════════════════════════════════════════════
async function postPaymentStatusToggle(order, oldStatus, newStatus, changedBy, transaction, toggleSeq) {
    if (!order.customerId) return { skipped: true, reason: 'no_customer_id' };

    // Use dueAmount for unpaid→paid (collect only what is still owed).
    // Use dueAmount snapshot at time of call — caller has already locked the row.
    const dueAmount = Number(order.dueAmount) || 0;

    if (oldStatus === 'unpaid' && dueAmount <= 0) return { skipped: true, reason: 'zero_due' };
    if (oldStatus === 'paid') {
        // When reversing to unpaid, the amount being reversed is what was previously
        // cleared — which is the total minus the original POS cash.
        const originalPaid = Number(order.originalPaidAmount) || 0;
        const totalAmt     = Number(order.total) || 0;
        const togglePaid   = Math.max(0, totalAmt - originalPaid);
        if (togglePaid <= 0) return { skipped: true, reason: 'zero_toggle_amount' };
    }

    // Build a unique referenceId by embedding the toggle sequence.
    // Format: '<order-uuid>_toggle_<seq>'  — unique per event, stable on retry.
    const seq           = Number(toggleSeq) || 0;
    const toggleRefId   = `${order.id}_toggle_${seq}`;
    const toggleRefType = 'PAYMENT_TOGGLE';

    const dup = await db.journalBatch.findOne({
        where: { referenceType: toggleRefType, referenceId: toggleRefId, isReversed: false },
        transaction
    });
    if (dup) {
        console.log(`[AE] SKIP TOGGLE: ${order.orderNumber} seq=${seq} already posted (${dup.batchNumber})`);
        return { skipped: true, batchNumber: dup.batchNumber };
    }

    const [cashAcct, customerAcct] = await Promise.all([
        _cashOrBank(order.bankAccountId, transaction),
        _partyAccount('customer', order.customerId, order.customerName || 'Unknown', transaction)
    ]);

    let entries, description, amount;

    if (oldStatus === 'unpaid' && newStatus === 'paid') {
        amount = dueAmount;
        description = `Payment received (toggle) for ${order.orderNumber} [${changedBy}]`;
        entries = [
            { accountId: cashAcct.id,     debit: amount, credit: 0,      narration: `Toggle paid: ${order.orderNumber}` },
            { accountId: customerAcct.id, debit: 0,      credit: amount, narration: `Toggle paid: ${order.orderNumber}` }
        ];
    } else if (oldStatus === 'paid' && newStatus === 'unpaid') {
        // Reverse only the toggle-induced cash: total - originalPaidAmount.
        // originalPaidAmount was already posted via INVOICE_CASH at creation.
        const originalPaid = Number(order.originalPaidAmount) || 0;
        const totalAmt     = Number(order.total) || 0;
        amount = Math.max(0, totalAmt - originalPaid);
        description = `Payment reversed (toggle) for ${order.orderNumber} [${changedBy}]`;
        entries = [
            { accountId: customerAcct.id, debit: amount, credit: 0,      narration: `Toggle unpaid: ${order.orderNumber}` },
            { accountId: cashAcct.id,     debit: 0,      credit: amount, narration: `Toggle unpaid: ${order.orderNumber}` }
        ];
    } else {
        return { skipped: true, reason: 'noop' };
    }

    const result = await ledgerService.createJournalBatch({
        referenceType:   toggleRefType,
        referenceId:     toggleRefId,
        description,
        transactionDate: new Date(),
        entries
    }, transaction);

    console.log(`[AE] TOGGLE ${order.orderNumber} ${oldStatus}→${newStatus} seq=${seq} → ${result.batch.batchNumber} (₹${amount})`);
    return { posted: true, batchNumber: result.batch.batchNumber, batchId: result.batch.id };
}

// ══════════════════════════════════════════════════════════════════════════
//  8. REVERSAL — generic: find all active batches for a referenceId and
//     create mirror batches with DR↔CR swapped.
//     Returns array of reversal results.
// ══════════════════════════════════════════════════════════════════════════
async function reverseAllBatchesForReference(referenceId, reason, transaction) {
    const activeBatches = await db.journalBatch.findAll({
        where: { referenceId, isReversed: false, isPosted: true },
        transaction
    });

    if (!activeBatches.length) {
        console.log(`[AE] SKIP REVERSAL: No active batches for ${referenceId}`);
        return [];
    }

    const results = [];
    for (const batch of activeBatches) {
        const entries = await db.ledgerEntry.findAll({ where: { batchId: batch.id }, transaction });
        const result = await ledgerService.createJournalBatch({
            referenceType: 'REVERSAL',
            referenceId,
            description: `Reversal of ${batch.batchNumber}: ${reason}`,
            transactionDate: new Date(),
            entries: entries.map(e => ({
                accountId: e.accountId,
                debit:     Number(e.credit) || 0,
                credit:    Number(e.debit)  || 0,
                narration: `Reversal: ${e.narration || ''}`
            }))
        }, transaction);
        await batch.update({ isReversed: true, reversedBatchId: result.batch.id }, { transaction });
        console.log(`[AE] REVERSED batch ${batch.batchNumber} → ${result.batch.batchNumber}`);
        results.push({ reversed: true, originalBatchNumber: batch.batchNumber, reversalBatchNumber: result.batch.batchNumber });
    }
    return results;
}

// ── convenience wrappers ──────────────────────────────────────────────────
async function reverseInvoice(order, transaction) {
    return reverseAllBatchesForReference(order.id, `Invoice ${order.orderNumber || ''} deleted`, transaction);
}

async function reversePayment(payment, transaction) {
    return reverseAllBatchesForReference(payment.id, `Payment ${payment.paymentNumber || ''} deleted`, transaction);
}

async function reversePurchase(purchase, transaction) {
    return reverseAllBatchesForReference(purchase.id, `Purchase ${purchase.billNumber || ''} deleted`, transaction);
}

async function reverseExpense(expense, transaction) {
    return reverseAllBatchesForReference(expense.id, `Expense ${expense.id} deleted`, transaction);
}

// ══════════════════════════════════════════════════════════════════════════
//  9. CHART OF ACCOUNTS INITIALIZATION
//     Extended: adds GST accounts (CGST/SGST/IGST payable + input credit)
// ══════════════════════════════════════════════════════════════════════════
async function ensureGSTAccounts() {
    const gstAccounts = [
        // Output GST (liabilities)
        { code: '2200', name: 'GST Payable',         type: 'LIABILITY', subType: 'TAX',      parentCode: '2000', isSystemAccount: true },
        { code: '2201', name: 'CGST Payable',        type: 'LIABILITY', subType: 'TAX',      parentCode: '2200', isSystemAccount: true },
        { code: '2202', name: 'SGST Payable',        type: 'LIABILITY', subType: 'TAX',      parentCode: '2200', isSystemAccount: true },
        { code: '2203', name: 'IGST Payable',        type: 'LIABILITY', subType: 'TAX',      parentCode: '2200', isSystemAccount: true },
        // Input GST credit (assets)
        { code: '1500', name: 'GST Input Credit',    type: 'ASSET',     subType: 'TAX',      parentCode: '1000', isSystemAccount: true },
        { code: '1501', name: 'CGST Input Credit',   type: 'ASSET',     subType: 'TAX',      parentCode: '1500', isSystemAccount: true },
        { code: '1502', name: 'SGST Input Credit',   type: 'ASSET',     subType: 'TAX',      parentCode: '1500', isSystemAccount: true },
        { code: '1503', name: 'IGST Input Credit',   type: 'ASSET',     subType: 'TAX',      parentCode: '1500', isSystemAccount: true },
        // Customer Advances — liability for overpayments at invoice creation (CR-ADVANCE)
        { code: '2300', name: 'Customer Advances',   type: 'LIABILITY', subType: 'PAYABLE',  parentCode: '2000', isSystemAccount: true },
    ];

    const t = await db.sequelize.transaction();
    try {
        const codeToId = {};
        // Fetch all existing codes first
        const existing = await db.account.findAll({ attributes: ['id', 'code'], transaction: t });
        for (const acc of existing) codeToId[acc.code] = acc.id;

        for (const spec of gstAccounts) {
            if (!codeToId[spec.code]) {
                const created = await db.account.create({
                    code:            spec.code,
                    name:            spec.name,
                    type:            spec.type,
                    subType:         spec.subType || null,
                    isSystemAccount: spec.isSystemAccount || false
                }, { transaction: t });
                codeToId[spec.code] = created.id;
            }
        }

        // Wire up parentIds
        for (const spec of gstAccounts) {
            if (spec.parentCode && codeToId[spec.parentCode] && codeToId[spec.code]) {
                await db.account.update(
                    { parentId: codeToId[spec.parentCode] },
                    { where: { code: spec.code }, transaction: t }
                );
            }
        }

        await t.commit();
        console.log('[AE] GST accounts ensured');
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

// ══════════════════════════════════════════════════════════════════════════
//  10. STOCK UPDATE — update product.currentStock within a transaction
//      direction: 'IN' (purchase) | 'OUT' (sale) | 'ADJUSTMENT'
// ══════════════════════════════════════════════════════════════════════════
async function updateStock(productId, quantity, direction, referenceId, referenceType, transaction, txDate = null) {
    if (!productId || !quantity) return { skipped: true, reason: 'no_product_or_qty' };

    // HR-STOCK: Stock update failures MUST propagate to the caller so the outer
    // Sequelize transaction rolls back entirely. Previously this was wrapped in a
    // try/catch that returned { skipped: true } — allowing the invoice to be saved
    // and the ledger to be posted while inventory remained unchanged. Over time this
    // creates a permanent, undetectable divergence between financial records and stock.
    //
    // The only acceptable reason to skip a stock update is if the product genuinely
    // has no currentStock column yet (migration not run). Every other error is fatal.
    const product = await db.product.findByPk(productId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!product) {
        // Product record deleted between validation and write — this is a data integrity
        // problem that should bubble up and roll back the containing transaction.
        throw new Error(`[AE] updateStock: product ${productId} not found — transaction rolled back`);
    }

    // Graceful skip ONLY for missing column (migration not yet applied in dev/staging).
    if (product.currentStock === undefined) {
        console.warn(`[AE] updateStock: currentStock column missing for product ${productId} — skipping (run migrations)`);
        return { skipped: true, reason: 'currentStock_column_missing' };
    }

    const prev = Number(product.currentStock) || 0;
    let next;
    if (direction === 'IN')       next = prev + Number(quantity);
    else if (direction === 'OUT') next = prev - Number(quantity);
    else                          next = Number(quantity); // ADJUSTMENT = set absolute

    // Prevent negative stock on OUT movements (optional: can be relaxed for backorder support).
    if (direction === 'OUT' && next < 0) {
        throw new Error(`[AE] updateStock: insufficient stock for product ${productId} — available: ${prev}, requested: ${quantity}`);
    }

    await product.update({ currentStock: next }, { transaction });

    const date = txDate ? new Date(txDate) : new Date();
    await db.stockTransaction.create({
        productId,
        type:            direction === 'IN' ? 'in' : direction === 'OUT' ? 'out' : 'adjustment',
        quantity:        Math.abs(Number(quantity)),
        previousStock:   prev,
        newStock:        next,
        referenceId:     referenceId || null,
        referenceType:   referenceType || null,
        transactionDate: date.toISOString().slice(0, 10)
    }, { transaction });

    return { updated: true, previousStock: prev, newStock: next };
}

// ══════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════════════════════════════════
module.exports = {
    // Primary posting flows
    postSalesInvoice,
    postCashReceiptForInvoice,
    postCustomerReceipt,
    postPurchaseBill,
    postSupplierPayment,
    postExpense,
    postPaymentStatusToggle,

    // Reversals
    reverseInvoice,
    reversePayment,
    reversePurchase,
    reverseExpense,
    reverseAllBatchesForReference,

    // Setup
    ensureGSTAccounts,

    // Stock
    updateStock,

    // Internal helpers exposed for testing
    _acct,
    _cashOrBank,
    _partyAccount
};
