/**
 * Receipt Allocation Controller
 *
 * Tally-style bill-wise reconciliation:
 * - "Against Ref" = allocate a payment/receipt against specific invoice(s)
 * - "On Account"  = unallocated payment (advance)
 *
 * ALL allocations are explicit user actions — NO auto-FIFO, NO auto-reconciliation.
 *
 * PHASE 1 ARCHITECTURAL FIX (C1 / C2 / C8):
 * ─────────────────────────────────────────
 * paidAmount is now ALWAYS DERIVED — it is NEVER computed incrementally or
 * decrementally from the previous stored value.  The canonical formula is:
 *
 *   paidAmount = originalPaidAmount + SUM(active receipt_allocations for this order)
 *
 * where originalPaidAmount is the immutable POS cash captured at invoice creation
 * and protected by a PostgreSQL trigger (fn_guard_original_paid_amount).
 *
 * This makes it STRUCTURALLY IMPOSSIBLE for allocation delete or undo to erase
 * the POS cash component, because we never read the stored paidAmount during
 * recalculation — we always go back to the immutable source.
 */

'use strict';

const db = require('../models');
const { createAuditLog } = require('../middleware/auditLogger');

// ─────────────────────────────────────────────────────────────────────────────
//  CANONICAL DERIVATION HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the canonical paidAmount / dueAmount / paymentStatus for an order.
 *
 * Formula:
 *   paidAmount  = originalPaidAmount + SUM(active receipt_allocations)
 *   dueAmount   = MAX(0, total - paidAmount)  [negative = overpayment]
 *   paymentStatus = derived from paidAmount vs total
 *
 * This function is the SINGLE authoritative source for order payment state.
 * Every write path (allocate, delete, undo) calls this — never computes inline.
 *
 * @param {string}  orderId     - UUID of the order
 * @param {Object}  transaction - Active Sequelize transaction (required for consistency)
 * @returns {{ paidAmount, dueAmount, paymentStatus }}
 * @throws  if order not found or originalPaidAmount is missing
 */
async function computeDerivedPaymentFields(orderId, transaction) {
    // Read with a SELECT FOR UPDATE lock — any concurrent writer for this order
    // will block until this transaction completes, preventing split-brain.
    const order = await db.order.findByPk(orderId, {
        attributes: ['id', 'total', 'originalPaidAmount'],
        transaction,
        lock: transaction.LOCK.UPDATE
    });

    if (!order) throw new Error(`Order ${orderId} not found`);

    const originalPaid = Number(order.originalPaidAmount) || 0;
    const total        = Number(order.total)              || 0;

    // Sum all non-deleted allocations for this order
    const [rows] = await db.sequelize.query(
        `SELECT COALESCE(SUM(amount), 0) AS alloc_total
         FROM receipt_allocations
         WHERE "orderId" = :orderId AND "isDeleted" = false`,
        { replacements: { orderId }, transaction }
    );
    const allocTotal = Number(rows[0].alloc_total) || 0;

    const round2 = (n) => Math.round(n * 100) / 100;
    const paidAmount = round2(originalPaid + allocTotal);
    const dueAmount  = round2(total - paidAmount); // allow negative for overpayment

    let paymentStatus = 'unpaid';
    if (paidAmount >= total - 0.01) paymentStatus = 'paid';
    else if (paidAmount > 0.01)     paymentStatus = 'partial';

    return { paidAmount, dueAmount, paymentStatus };
}

/**
 * Apply the derived payment fields to the order row.
 * Called after every allocation write (create or soft-delete).
 */
async function applyDerivedPaymentFields(orderId, transaction) {
    const fields = await computeDerivedPaymentFields(orderId, transaction);
    await db.order.update(
        {
            paidAmount:    fields.paidAmount,
            dueAmount:     fields.dueAmount,
            paymentStatus: fields.paymentStatus
        },
        { where: { id: orderId }, transaction }
    );
    return fields;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONTROLLER METHODS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {

    // ── computeDerivedPaymentFields exposed for other modules ────────────────
    computeDerivedPaymentFields,

    /**
     * Allocate a payment against one or more invoices.
     * Body: { paymentId, allocations: [{ orderId, amount, notes? }], changedBy }
     */
    allocateReceipt: async (req, res) => {
        try {
            const { paymentId, allocations, changedBy } = req.body;

            if (!paymentId)
                return res.status(400).json({ status: 400, message: 'paymentId is required' });
            if (!Array.isArray(allocations) || allocations.length === 0)
                return res.status(400).json({ status: 400, message: 'allocations array is required' });
            if (!changedBy?.trim())
                return res.status(400).json({ status: 400, message: 'changedBy is required for audit trail' });

            const result = await db.sequelize.transaction(async (transaction) => {
                // Lock the payment row to prevent concurrent allocation on the same receipt
                const payment = await db.payment.findByPk(paymentId, {
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });
                if (!payment)            throw new Error('Payment not found');
                if (payment.isDeleted)   throw new Error('Payment has been deleted');
                if (payment.partyType !== 'customer')
                    throw new Error('Only customer payments can be allocated against invoices');

                // How much of this payment is already allocated?
                const [payAllocRows] = await db.sequelize.query(
                    `SELECT COALESCE(SUM(amount), 0) AS total FROM receipt_allocations
                     WHERE "paymentId" = :paymentId AND "isDeleted" = false`,
                    { replacements: { paymentId }, transaction }
                );
                const alreadyAllocated = Number(payAllocRows[0].total) || 0;
                const paymentAmount    = Number(payment.amount);
                const remainingCapacity = round2(paymentAmount - alreadyAllocated);

                // Validate total new allocation does not exceed remaining capacity
                const newTotal = allocations.reduce((s, a) => s + Number(a.amount), 0);
                if (round2(newTotal) > remainingCapacity + 0.01) {
                    throw new Error(
                        `Over-allocation: payment ₹${paymentAmount.toFixed(2)}, ` +
                        `already allocated ₹${alreadyAllocated.toFixed(2)}, ` +
                        `capacity remaining ₹${remainingCapacity.toFixed(2)}, ` +
                        `attempted ₹${round2(newTotal).toFixed(2)}`
                    );
                }

                const createdAllocations = [];

                for (const alloc of allocations) {
                    if (!alloc.orderId || !(Number(alloc.amount) > 0))
                        throw new Error('Each allocation must have orderId and a positive amount');

                    // Lock the order row before reading its allocations
                    const order = await db.order.findByPk(alloc.orderId, {
                        transaction,
                        lock: transaction.LOCK.UPDATE
                    });
                    if (!order)          throw new Error(`Invoice ${alloc.orderId} not found`);
                    if (order.isDeleted) throw new Error(`Invoice ${order.orderNumber} has been deleted`);

                    // Verify this allocation would not over-allocate the invoice
                    const [invAllocRows] = await db.sequelize.query(
                        `SELECT COALESCE(SUM(amount), 0) AS total FROM receipt_allocations
                         WHERE "orderId" = :orderId AND "isDeleted" = false`,
                        { replacements: { orderId: alloc.orderId }, transaction }
                    );
                    const invoiceAllocated = Number(invAllocRows[0].total) || 0;
                    const invoiceTotal     = Number(order.total) || 0;

                    if (round2(invoiceAllocated + Number(alloc.amount)) > invoiceTotal + 0.01) {
                        throw new Error(
                            `Over-allocation on ${order.orderNumber}: ` +
                            `total ₹${invoiceTotal.toFixed(2)}, ` +
                            `already allocated ₹${invoiceAllocated.toFixed(2)}, ` +
                            `attempting ₹${Number(alloc.amount).toFixed(2)}`
                        );
                    }

                    // Create the allocation record
                    const allocation = await db.receiptAllocation.create({
                        paymentId,
                        orderId: alloc.orderId,
                        amount:          round2(Number(alloc.amount)),
                        allocatedBy:     req.user?.id,
                        allocatedByName: changedBy.trim(),
                        notes:           alloc.notes || null
                    }, { transaction });

                    createdAllocations.push(allocation);

                    // CANONICAL DERIVATION: derive paidAmount from originalPaidAmount + SUM(allocations)
                    // Never do additive math on the stored paidAmount.
                    const derived = await applyDerivedPaymentFields(alloc.orderId, transaction);

                    console.log(
                        `[ALLOCATION] ${order.orderNumber}: +₹${alloc.amount} from ${payment.paymentNumber}` +
                        ` → paid=${derived.paidAmount.toFixed(2)} due=${derived.dueAmount.toFixed(2)} (${derived.paymentStatus})`
                    );
                }

                return createdAllocations;
            });

            await createAuditLog({
                userId:     req.user?.id,
                userName:   changedBy.trim(),
                userRole:   req.user?.role || 'unknown',
                action:     'CREATE',
                entityType: 'RECEIPT_ALLOCATION',
                entityId:   paymentId,
                entityName: `Allocation for payment ${paymentId}`,
                newValues:  { allocations },
                description:`${changedBy.trim()} allocated payment against ${allocations.length} invoice(s)`,
                ipAddress:  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                userAgent:  req.headers['user-agent']
            });

            return res.status(200).json({
                status:  200,
                message: `Successfully allocated against ${allocations.length} invoice(s)`,
                data:    result
            });

        } catch (error) {
            console.error('[RECEIPT ALLOCATION] allocateReceipt error:', error);
            return res.status(400).json({ status: 400, message: error.message });
        }
    },

    // ── READ-ONLY: allocations for a payment ────────────────────────────────
    getPaymentAllocations: async (req, res) => {
        try {
            const { paymentId } = req.params;
            const allocations = await db.receiptAllocation.findAll({
                where: { paymentId, isDeleted: false },
                order: [['createdAt', 'ASC']]
            });
            const payment      = await db.payment.findByPk(paymentId);
            const totalAllocated = allocations.reduce((s, a) => s + Number(a.amount), 0);

            return res.status(200).json({
                status: 200,
                data: {
                    payment,
                    allocations,
                    totalAllocated: round2(totalAllocated),
                    unallocated:    payment ? round2(Math.max(0, Number(payment.amount) - totalAllocated)) : 0
                }
            });
        } catch (error) {
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    // ── READ-ONLY: allocations for an invoice ────────────────────────────────
    getInvoiceAllocations: async (req, res) => {
        try {
            const { orderId } = req.params;
            const allocations = await db.receiptAllocation.findAll({
                where: { orderId, isDeleted: false },
                order: [['createdAt', 'ASC']]
            });
            const order        = await db.order.findByPk(orderId);
            const totalAllocated = allocations.reduce((s, a) => s + Number(a.amount), 0);

            return res.status(200).json({
                status: 200,
                data: {
                    order: order ? {
                        id:            order.id,
                        orderNumber:   order.orderNumber,
                        total:         Number(order.total),
                        originalPaidAmount: Number(order.originalPaidAmount),
                        paidAmount:    Number(order.paidAmount),
                        dueAmount:     Number(order.dueAmount),
                        paymentStatus: order.paymentStatus
                    } : null,
                    allocations,
                    totalAllocated:    round2(totalAllocated),
                    derivedPaidAmount: order
                        ? round2(Number(order.originalPaidAmount) + totalAllocated)
                        : 0,
                    derivedDue: order
                        ? round2(Number(order.total) - Number(order.originalPaidAmount) - totalAllocated)
                        : 0
                }
            });
        } catch (error) {
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Soft-delete a receipt allocation (explicit user action, fully reversible).
     *
     * After the soft-delete, paidAmount is re-derived from the canonical formula:
     *   paidAmount = originalPaidAmount + SUM(remaining active allocations)
     *
     * This is structurally safe: originalPaidAmount cannot be affected by
     * deleting an allocation record.
     */
    deleteAllocation: async (req, res) => {
        try {
            const { allocationId } = req.params;
            const { changedBy }    = req.body;

            if (!changedBy?.trim())
                return res.status(400).json({ status: 400, message: 'changedBy is required' });

            let affectedOrderId;

            await db.sequelize.transaction(async (transaction) => {
                const allocation = await db.receiptAllocation.findByPk(allocationId, { transaction });
                if (!allocation || allocation.isDeleted)
                    throw new Error('Allocation not found or already deleted');

                affectedOrderId = allocation.orderId;

                // Soft-delete the allocation record (append-only, fully auditable)
                await allocation.update({ isDeleted: true }, { transaction });

                // CANONICAL DERIVATION: re-derive paidAmount from immutable source.
                // This is SAFE regardless of the order's history — we never read
                // the old paidAmount, we always reconstruct from originalPaidAmount.
                const derived = await applyDerivedPaymentFields(affectedOrderId, transaction);

                console.log(
                    `[ALLOCATION DELETE] ${allocationId}: ` +
                    `→ paid=${derived.paidAmount.toFixed(2)} due=${derived.dueAmount.toFixed(2)} (${derived.paymentStatus})`
                );
            });

            await createAuditLog({
                userId:     req.user?.id,
                userName:   changedBy.trim(),
                userRole:   req.user?.role || 'unknown',
                action:     'DELETE',
                entityType: 'RECEIPT_ALLOCATION',
                entityId:   allocationId,
                description:`${changedBy.trim()} removed receipt allocation ${allocationId}`,
                ipAddress:  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                userAgent:  req.headers['user-agent']
            });

            return res.status(200).json({ status: 200, message: 'Allocation removed successfully' });

        } catch (error) {
            console.error('[RECEIPT ALLOCATION] deleteAllocation error:', error);
            return res.status(400).json({ status: 400, message: error.message });
        }
    },

    /**
     * PREVIEW what undoing auto-reconciliation would change (READ-ONLY).
     */
    previewUndoAutoReconciliation: async (req, res) => {
        try {
            const backfillAllocations = await db.receiptAllocation.findAll({
                where: {
                    [db.Sequelize.Op.or]: [
                        { allocatedByName: 'system-backfill' },
                        { notes: { [db.Sequelize.Op.like]: 'Backfill FIFO:%' } }
                    ],
                    isDeleted: false
                },
                order: [['createdAt', 'ASC']]
            });

            if (backfillAllocations.length === 0) {
                return res.status(200).json({
                    status:  200,
                    message: 'No auto-reconciliation records found.',
                    data:    { backfillCount: 0, affectedOrders: [] }
                });
            }

            const affectedOrderIds = [...new Set(backfillAllocations.map(a => a.orderId))];
            const affectedOrders   = [];

            for (const orderId of affectedOrderIds) {
                const order = await db.order.findByPk(orderId);
                if (!order) continue;

                const allActive = await db.receiptAllocation.findAll({
                    where: { orderId, isDeleted: false }
                });

                const backfillTotal = allActive
                    .filter(a => a.allocatedByName === 'system-backfill' || a.notes?.startsWith('Backfill FIFO:'))
                    .reduce((s, a) => s + Number(a.amount), 0);

                const legitimateTotal = allActive
                    .filter(a => a.allocatedByName !== 'system-backfill' && !a.notes?.startsWith('Backfill FIFO:'))
                    .reduce((s, a) => s + Number(a.amount), 0);

                const originalPaid = Number(order.originalPaidAmount) || 0;
                const total        = Number(order.total) || 0;
                const afterPaid    = round2(originalPaid + legitimateTotal);
                const afterDue     = round2(total - afterPaid);
                let   afterStatus  = 'unpaid';
                if (afterPaid >= total - 0.01) afterStatus = 'paid';
                else if (afterPaid > 0.01)     afterStatus = 'partial';

                affectedOrders.push({
                    orderId:       order.id,
                    orderNumber:   order.orderNumber,
                    customerName:  order.customerName,
                    orderTotal:    total,
                    originalPaidAmount: originalPaid,
                    current: {
                        paidAmount:    Number(order.paidAmount),
                        dueAmount:     Number(order.dueAmount),
                        paymentStatus: order.paymentStatus
                    },
                    afterUndo: {
                        paidAmount:    afterPaid,
                        dueAmount:     afterDue,
                        paymentStatus: afterStatus
                    },
                    backfillToRemove:        Math.round(backfillTotal * 100) / 100,
                    legitimateAllocKept:     Math.round(legitimateTotal * 100) / 100
                });
            }

            return res.status(200).json({
                status:  200,
                message: `Found ${backfillAllocations.length} backfill records affecting ${affectedOrders.length} orders.`,
                data:    { backfillCount: backfillAllocations.length, affectedOrderCount: affectedOrders.length, affectedOrders }
            });

        } catch (error) {
            console.error('[RECEIPT ALLOCATION] previewUndo error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * EXECUTE undo of auto-reconciliation (write path).
     *
     * Soft-deletes all backfill allocation records, then re-derives
     * paidAmount for each affected order using the canonical formula.
     */
    executeUndoAutoReconciliation: async (req, res) => {
        try {
            const { changedBy } = req.body;
            if (!changedBy?.trim())
                return res.status(400).json({ status: 400, message: 'changedBy is required for audit trail' });

            const result = await db.sequelize.transaction(async (transaction) => {
                const backfillAllocations = await db.receiptAllocation.findAll({
                    where: {
                        [db.Sequelize.Op.or]: [
                            { allocatedByName: 'system-backfill' },
                            { notes: { [db.Sequelize.Op.like]: 'Backfill FIFO:%' } }
                        ],
                        isDeleted: false
                    },
                    transaction
                });

                if (backfillAllocations.length === 0)
                    return { removedCount: 0, ordersFixed: [] };

                const affectedOrderIds = [...new Set(backfillAllocations.map(a => a.orderId))];

                // Soft-delete all backfill allocations (append-only: records stay in DB)
                await db.receiptAllocation.update(
                    { isDeleted: true },
                    {
                        where: {
                            [db.Sequelize.Op.or]: [
                                { allocatedByName: 'system-backfill' },
                                { notes: { [db.Sequelize.Op.like]: 'Backfill FIFO:%' } }
                            ],
                            isDeleted: false
                        },
                        transaction
                    }
                );

                const ordersFixed = [];

                for (const orderId of affectedOrderIds) {
                    const orderBefore = await db.order.findByPk(orderId, { transaction });
                    if (!orderBefore) continue;

                    const oldPaid   = Number(orderBefore.paidAmount);
                    const oldStatus = orderBefore.paymentStatus;

                    // CANONICAL DERIVATION after removing backfill allocations
                    const derived = await applyDerivedPaymentFields(orderId, transaction);

                    ordersFixed.push({
                        orderNumber:  orderBefore.orderNumber,
                        customerName: orderBefore.customerName,
                        originalPaidAmount: Number(orderBefore.originalPaidAmount),
                        before: { paidAmount: oldPaid,          paymentStatus: oldStatus },
                        after:  { paidAmount: derived.paidAmount, dueAmount: derived.dueAmount, paymentStatus: derived.paymentStatus }
                    });
                }

                return { removedCount: backfillAllocations.length, ordersFixed };
            });

            await createAuditLog({
                userId:     req.user?.id,
                userName:   changedBy.trim(),
                userRole:   req.user?.role || 'unknown',
                action:     'UNDO_AUTO_RECONCILIATION',
                entityType: 'RECEIPT_ALLOCATION',
                entityId:   'bulk-undo',
                description:`${changedBy.trim()} reversed ${result.removedCount} backfill allocations, recalculated ${result.ordersFixed.length} orders`,
                ipAddress:  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                userAgent:  req.headers['user-agent']
            });

            return res.status(200).json({
                status:  200,
                message: `Undo complete: removed ${result.removedCount} records, recalculated ${result.ordersFixed.length} orders`,
                data:    result
            });

        } catch (error) {
            console.error('[RECEIPT ALLOCATION] executeUndo error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  INTERNAL UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function round2(n) { return Math.round(n * 100) / 100; }
