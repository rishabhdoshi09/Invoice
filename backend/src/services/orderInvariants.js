/**
 * Pre-commit Order Invariant Enforcement
 *
 * Call assertOrderInvariants(orderId, transaction) inside every DB transaction
 * that creates or modifies an order.  The function throws a hard error if any
 * invariant is violated, which causes the entire Sequelize transaction to roll
 * back automatically — nothing is persisted.
 *
 * Invariants checked:
 *   INV-1  subTotal = SUM(orderItems.totalPrice)
 *   INV-2  subTotal + tax = total
 *   INV-3  paidAmount + dueAmount = total  (within ₹0.01 tolerance)
 *   INV-4  paymentStatus label matches paidAmount/total ratio
 *   INV-5  no active receipt_allocation exceeds its linked payment amount
 *   INV-6  SUM(active receipt_allocations for order) <= total
 *   INV-7  journal batch (INVOICE type) exists for this order when CoA is set up
 */

'use strict';

const db = require('../models');

const TOLERANCE = 0.01; // ₹0.01 acceptable rounding gap

/**
 * Round to 2 decimal places (same logic as controller).
 */
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Assert all financial invariants for a given order within an active transaction.
 * Throws InvariantError (subclass of Error) with a machine-readable `code` field
 * if any invariant fails so callers can log / surface specific details.
 *
 * @param {string} orderId   - UUID of the order to validate
 * @param {object} transaction - Active Sequelize transaction (must be same txn as the write)
 * @param {object} [options]
 * @param {boolean} [options.skipLedgerCheck=false] - Skip INV-7 (use during order creation
 *   before ledger posting has happened — ledger check should be done after posting).
 */
async function assertOrderInvariants(orderId, transaction, options = {}) {
    const { skipLedgerCheck = false } = options;

    // ── Fetch order ─────────────────────────────────────────────────────────────
    const order = await db.order.findByPk(orderId, {
        include: [{ model: db.orderItems, as: 'orderItems', required: false }],
        transaction,
        lock: transaction.LOCK.SHARE   // Consistent read, don't block writers
    });

    if (!order) {
        throw new InvariantError(
            `INV-0: Order ${orderId} not found during invariant check`,
            'INV_ORDER_NOT_FOUND'
        );
    }

    const total         = round2(Number(order.total)         || 0);
    const subTotal      = round2(Number(order.subTotal)      || 0);
    const tax           = round2(Number(order.tax)           || 0);
    const paidAmount    = round2(Number(order.paidAmount)    || 0);
    const dueAmount     = round2(Number(order.dueAmount)     || 0);
    const paymentStatus = order.paymentStatus;
    const orderNumber   = order.orderNumber;
    const items         = order.orderItems || [];

    // ── INV-1: subTotal = SUM(line item totals) ──────────────────────────────
    if (items.length > 0) {
        const computedSubTotal = round2(
            items.reduce((s, item) => s + (Number(item.totalPrice) || 0), 0)
        );
        if (Math.abs(computedSubTotal - subTotal) > TOLERANCE) {
            throw new InvariantError(
                `INV-1 [${orderNumber}]: subTotal mismatch. ` +
                `Stored=${subTotal}, SUM(items)=${computedSubTotal}, diff=${round2(Math.abs(computedSubTotal - subTotal))}`,
                'INV_SUBTOTAL_MISMATCH'
            );
        }
    }

    // ── INV-2: subTotal + tax = total ─────────────────────────────────────────
    const expectedTotal = round2(subTotal + tax);
    if (Math.abs(expectedTotal - total) > TOLERANCE) {
        throw new InvariantError(
            `INV-2 [${orderNumber}]: total mismatch. ` +
            `subTotal(${subTotal}) + tax(${tax}) = ${expectedTotal}, stored total=${total}`,
            'INV_TOTAL_MISMATCH'
        );
    }

    // ── INV-3: paidAmount + dueAmount = total ─────────────────────────────────
    const paymentSum = round2(paidAmount + dueAmount);
    if (Math.abs(paymentSum - total) > TOLERANCE) {
        throw new InvariantError(
            `INV-3 [${orderNumber}]: paid+due≠total. ` +
            `paid=${paidAmount}, due=${dueAmount}, sum=${paymentSum}, total=${total}`,
            'INV_PAID_DUE_TOTAL_MISMATCH'
        );
    }

    // ── INV-4: paymentStatus label consistency ────────────────────────────────
    let expectedStatus;
    if (paidAmount >= total - TOLERANCE) {
        expectedStatus = 'paid';
    } else if (paidAmount > TOLERANCE) {
        expectedStatus = 'partial';
    } else {
        expectedStatus = 'unpaid';
    }
    if (paymentStatus !== expectedStatus) {
        throw new InvariantError(
            `INV-4 [${orderNumber}]: paymentStatus label wrong. ` +
            `stored="${paymentStatus}", expected="${expectedStatus}" (paid=${paidAmount}, total=${total})`,
            'INV_PAYMENT_STATUS_MISMATCH'
        );
    }

    // ── INV-5 & INV-6: receipt_allocations ────────────────────────────────────
    // INV-5: no single allocation amount exceeds the linked payment amount
    // INV-6: total active allocations for this order ≤ order total
    const [allocRows] = await db.sequelize.query(
        `SELECT
            ra.id,
            ra.amount          AS alloc_amount,
            p.amount           AS payment_amount,
            p."paymentNumber"  AS payment_number
         FROM receipt_allocations ra
         JOIN payments p ON p.id = ra."paymentId"
         WHERE ra."orderId" = :orderId
           AND ra."isDeleted" = false`,
        { replacements: { orderId }, transaction }
    );

    for (const row of allocRows) {
        const allocAmt   = round2(Number(row.alloc_amount)   || 0);
        const paymentAmt = round2(Number(row.payment_amount) || 0);
        if (allocAmt > paymentAmt + TOLERANCE) {
            throw new InvariantError(
                `INV-5 [${orderNumber}]: allocation ${row.id} (${allocAmt}) exceeds ` +
                `its linked payment ${row.payment_number} (${paymentAmt})`,
                'INV_ALLOCATION_EXCEEDS_PAYMENT'
            );
        }
    }

    const totalAllocated = round2(
        allocRows.reduce((s, r) => s + (Number(r.alloc_amount) || 0), 0)
    );
    if (totalAllocated > total + TOLERANCE) {
        throw new InvariantError(
            `INV-6 [${orderNumber}]: total allocations (${totalAllocated}) exceed order total (${total})`,
            'INV_OVER_ALLOCATED'
        );
    }

    // ── INV-7: ledger journal batch exists ────────────────────────────────────
    if (!skipLedgerCheck) {
        const accountCount = await db.account.count({ transaction });
        if (accountCount > 0) {
            // CoA is initialised — every order must have an INVOICE batch
            const batch = await db.journalBatch.findOne({
                where: { referenceType: 'INVOICE', referenceId: orderId, isReversed: false },
                transaction
            });
            if (!batch) {
                throw new InvariantError(
                    `INV-7 [${orderNumber}]: No INVOICE journal batch found after ledger posting. ` +
                    `Chart of Accounts is initialised — every order must have a ledger entry.`,
                    'INV_MISSING_LEDGER_ENTRY'
                );
            }
        }
    }
}

/**
 * Structured error type for invariant violations.
 * Preserves a machine-readable `code` field alongside the human message.
 */
class InvariantError extends Error {
    constructor(message, code) {
        super(message);
        this.name  = 'InvariantError';
        this.code  = code;
    }
}

module.exports = { assertOrderInvariants, InvariantError };
