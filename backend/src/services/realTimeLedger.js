/**
 * Real-Time Ledger Posting Service
 * Posts journal entries to the new double-entry ledger system
 * alongside existing invoice/payment creation.
 * 
 * SAFE PARALLEL MODE: Old system (dueAmount/paidAmount) stays unchanged.
 * This service only ADDS new double-entry journal batches.
 */

const db = require('../models');
const LedgerService = require('./ledgerService');

const ledgerService = new LedgerService(db);

/**
 * Post an invoice (order) to the double-entry ledger.
 * DR: Customer Receivable Account (asset increases)
 * CR: Sales Revenue Account (income increases)
 *
 * @param {Object} order - The created order record
 * @param {Object} transaction - The active Sequelize transaction
 */
async function postInvoiceToLedger(order, transaction) {
    try {
        // Safeguard: prevent duplicate posting
        const existing = await db.journalBatch.findOne({
            where: { referenceType: 'INVOICE', referenceId: order.id },
            transaction
        });
        if (existing) {
            console.log(`[LEDGER] SKIP: Invoice ${order.orderNumber} already posted (batch ${existing.batchNumber})`);
            return { skipped: true, batchNumber: existing.batchNumber };
        }

        const total = Number(order.total) || 0;
        if (total <= 0) {
            console.log(`[LEDGER] SKIP: Invoice ${order.orderNumber} has zero/negative total`);
            return { skipped: true, reason: 'zero_total' };
        }

        // Get or create customer receivable account
        const customerAccount = await ledgerService.getOrCreateCustomerAccount(
            order.customerId,
            order.customerName || 'Walk-in Customer',
            transaction
        );

        // Get sales revenue account (code 4100)
        const salesAccount = await db.account.findOne({
            where: { code: '4100' },
            transaction
        });
        if (!salesAccount) {
            throw new Error('[LEDGER] Sales Revenue account (4100) not found. Run chart of accounts initialization first.');
        }

        // Create journal batch inside the same transaction
        const result = await ledgerService.createJournalBatch({
            referenceType: 'INVOICE',
            referenceId: order.id,
            description: `Invoice ${order.orderNumber} — ${order.customerName}`,
            transactionDate: order.createdAt,
            entries: [
                {
                    accountId: customerAccount.id,
                    debit: total,
                    credit: 0,
                    narration: `Invoice ${order.orderNumber}`
                },
                {
                    accountId: salesAccount.id,
                    debit: 0,
                    credit: total,
                    narration: `Invoice ${order.orderNumber}`
                }
            ]
        }, transaction);

        console.log(`[LEDGER] POSTED: Invoice ${order.orderNumber} → batch ${result.batch.batchNumber} (DR Customer ${total}, CR Sales ${total})`);
        return { posted: true, batchNumber: result.batch.batchNumber, batchId: result.batch.id };

    } catch (error) {
        console.error(`[LEDGER] ROLLBACK ERROR: Invoice ${order.orderNumber} — ${error.message}`);
        throw error; // Re-throw to trigger transaction rollback
    }
}

/**
 * Post a customer payment to the double-entry ledger.
 * DR: Cash/Bank Account (asset increases)
 * CR: Customer Receivable Account (receivable decreases)
 *
 * @param {Object} payment - The created payment record
 * @param {string|null} customerId - The customer ID (may come from lookup)
 * @param {string} customerName - The customer name for account creation
 * @param {Object} transaction - The active Sequelize transaction
 */
async function postPaymentToLedger(payment, customerId, customerName, transaction) {
    try {
        // Only handle customer payments
        if (payment.partyType !== 'customer') {
            console.log(`[LEDGER] SKIP: Payment ${payment.paymentNumber} is not a customer payment (type: ${payment.partyType})`);
            return { skipped: true, reason: 'not_customer_payment' };
        }

        // Safeguard: prevent duplicate posting
        const existing = await db.journalBatch.findOne({
            where: { referenceType: 'PAYMENT', referenceId: payment.id },
            transaction
        });
        if (existing) {
            console.log(`[LEDGER] SKIP: Payment ${payment.paymentNumber} already posted (batch ${existing.batchNumber})`);
            return { skipped: true, batchNumber: existing.batchNumber };
        }

        const amount = Number(payment.amount) || 0;
        if (amount <= 0) {
            console.log(`[LEDGER] SKIP: Payment ${payment.paymentNumber} has zero/negative amount`);
            return { skipped: true, reason: 'zero_amount' };
        }

        const partyId = customerId || payment.partyId;
        if (!partyId) {
            console.log(`[LEDGER] SKIP: Payment ${payment.paymentNumber} has no customer ID`);
            return { skipped: true, reason: 'no_customer_id' };
        }

        // Get or create customer receivable account
        const customerAccount = await ledgerService.getOrCreateCustomerAccount(
            partyId,
            customerName || payment.partyName || 'Unknown Customer',
            transaction
        );

        // Get cash account (code 1100)
        const cashAccount = await db.account.findOne({
            where: { code: '1100' },
            transaction
        });
        if (!cashAccount) {
            throw new Error('[LEDGER] Cash account (1100) not found. Run chart of accounts initialization first.');
        }

        // Create journal batch inside the same transaction
        const result = await ledgerService.createJournalBatch({
            referenceType: 'PAYMENT',
            referenceId: payment.id,
            description: `Receipt ${payment.paymentNumber} — ${customerName || payment.partyName}`,
            transactionDate: payment.createdAt,
            entries: [
                {
                    accountId: cashAccount.id,
                    debit: amount,
                    credit: 0,
                    narration: `Receipt ${payment.paymentNumber}`
                },
                {
                    accountId: customerAccount.id,
                    debit: 0,
                    credit: amount,
                    narration: `Receipt ${payment.paymentNumber}`
                }
            ]
        }, transaction);

        console.log(`[LEDGER] POSTED: Payment ${payment.paymentNumber} → batch ${result.batch.batchNumber} (DR Cash ${amount}, CR Customer ${amount})`);
        return { posted: true, batchNumber: result.batch.batchNumber, batchId: result.batch.id };

    } catch (error) {
        console.error(`[LEDGER] ROLLBACK ERROR: Payment ${payment.paymentNumber} — ${error.message}`);
        throw error; // Re-throw to trigger transaction rollback
    }
}

/**
 * Create a REVERSAL journal batch for a deleted invoice.
 * Swaps debit/credit from the original INVOICE batch.
 *
 * @param {Object} order - The order being soft-deleted
 * @param {Object} transaction - The active Sequelize transaction
 */
async function reverseInvoiceLedger(order, transaction) {
    try {
        // Find the original INVOICE batch
        const originalBatch = await db.journalBatch.findOne({
            where: { referenceType: 'INVOICE', referenceId: order.id, isReversed: false },
            transaction
        });
        if (!originalBatch) {
            console.log(`[LEDGER] SKIP REVERSAL: No INVOICE batch found for order ${order.orderNumber || order.id}`);
            return { skipped: true, reason: 'no_original_batch' };
        }

        // Prevent double reversal
        const existingReversal = await db.journalBatch.findOne({
            where: { referenceType: 'REVERSAL', referenceId: order.id },
            transaction
        });
        if (existingReversal) {
            console.log(`[LEDGER] SKIP REVERSAL: Invoice ${order.orderNumber || order.id} already reversed`);
            return { skipped: true, reason: 'already_reversed' };
        }

        // Fetch original entries
        const originalEntries = await db.ledgerEntry.findAll({
            where: { batchId: originalBatch.id },
            transaction
        });

        // Create reversal batch with swapped debit/credit
        const result = await ledgerService.createJournalBatch({
            referenceType: 'REVERSAL',
            referenceId: order.id,
            description: `Reversal of Invoice ${order.orderNumber || ''} (deleted)`,
            transactionDate: new Date(),
            entries: originalEntries.map(e => ({
                accountId: e.accountId,
                debit: Number(e.credit) || 0,
                credit: Number(e.debit) || 0,
                narration: `Reversal: ${e.narration || ''}`
            }))
        }, transaction);

        // Mark original batch as reversed
        await originalBatch.update({ isReversed: true }, { transaction });

        console.log(`[LEDGER] REVERSED: Invoice ${order.orderNumber || order.id} → batch ${result.batch.batchNumber}`);
        return { reversed: true, batchNumber: result.batch.batchNumber };

    } catch (error) {
        console.error(`[LEDGER] REVERSAL ERROR: Invoice ${order.orderNumber || order.id} — ${error.message}`);
        throw error;
    }
}

/**
 * Create a REVERSAL journal batch for a deleted payment.
 * Swaps debit/credit from the original PAYMENT batch.
 *
 * @param {Object} payment - The payment being soft-deleted
 * @param {Object} transaction - The active Sequelize transaction
 */
async function reversePaymentLedger(payment, transaction) {
    try {
        const originalBatch = await db.journalBatch.findOne({
            where: { referenceType: 'PAYMENT', referenceId: payment.id, isReversed: false },
            transaction
        });
        if (!originalBatch) {
            console.log(`[LEDGER] SKIP REVERSAL: No PAYMENT batch found for payment ${payment.paymentNumber || payment.id}`);
            return { skipped: true, reason: 'no_original_batch' };
        }

        const existingReversal = await db.journalBatch.findOne({
            where: { referenceType: 'REVERSAL', referenceId: payment.id },
            transaction
        });
        if (existingReversal) {
            console.log(`[LEDGER] SKIP REVERSAL: Payment ${payment.paymentNumber || payment.id} already reversed`);
            return { skipped: true, reason: 'already_reversed' };
        }

        const originalEntries = await db.ledgerEntry.findAll({
            where: { batchId: originalBatch.id },
            transaction
        });

        const result = await ledgerService.createJournalBatch({
            referenceType: 'REVERSAL',
            referenceId: payment.id,
            description: `Reversal of Payment ${payment.paymentNumber || ''} (deleted)`,
            transactionDate: new Date(),
            entries: originalEntries.map(e => ({
                accountId: e.accountId,
                debit: Number(e.credit) || 0,
                credit: Number(e.debit) || 0,
                narration: `Reversal: ${e.narration || ''}`
            }))
        }, transaction);

        await originalBatch.update({ isReversed: true }, { transaction });

        console.log(`[LEDGER] REVERSED: Payment ${payment.paymentNumber || payment.id} → batch ${result.batch.batchNumber}`);
        return { reversed: true, batchNumber: result.batch.batchNumber };

    } catch (error) {
        console.error(`[LEDGER] REVERSAL ERROR: Payment ${payment.paymentNumber || payment.id} — ${error.message}`);
        throw error;
    }
}

module.exports = {
    postInvoiceToLedger,
    postPaymentToLedger,
    reverseInvoiceLedger,
    reversePaymentLedger
};
