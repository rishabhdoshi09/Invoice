/**
 * Receipt Allocation Controller
 * 
 * Tally-style bill-wise reconciliation:
 * - "Against Ref" = allocate a payment/receipt against specific invoice(s)
 * - "On Account" = unallocated payment (advance)
 * 
 * ALL allocations are explicit user actions — no auto-FIFO.
 */
const db = require('../models');
const { createAuditLog } = require('../middleware/auditLogger');
const { postPaymentToLedger } = require('../services/realTimeLedger');

module.exports = {
    /**
     * Allocate a payment against one or more invoices.
     * 
     * Body: {
     *   paymentId: UUID,
     *   allocations: [{ orderId: UUID, amount: number }],
     *   changedBy: string
     * }
     * 
     * Validates:
     * - Payment exists and is a customer payment
     * - Total allocation <= payment amount
     * - Each allocation <= invoice total
     * - No over-allocation per invoice
     */
    allocateReceipt: async (req, res) => {
        try {
            const { paymentId, allocations, changedBy } = req.body;

            if (!paymentId) {
                return res.status(400).json({ status: 400, message: 'paymentId is required' });
            }
            if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
                return res.status(400).json({ status: 400, message: 'allocations array is required' });
            }
            if (!changedBy || !changedBy.trim()) {
                return res.status(400).json({ status: 400, message: 'changedBy (your name) is required for audit trail' });
            }

            const result = await db.sequelize.transaction(async (transaction) => {
                // Fetch payment
                const payment = await db.payment.findByPk(paymentId, { transaction });
                if (!payment) {
                    throw new Error('Payment not found');
                }
                if (payment.partyType !== 'customer') {
                    throw new Error('Only customer payments can be allocated against invoices');
                }

                // Get existing allocations for this payment
                const existingAllocations = await db.receiptAllocation.findAll({
                    where: { paymentId, isDeleted: false },
                    transaction
                });
                const existingTotal = existingAllocations.reduce((s, a) => s + Number(a.amount), 0);

                // Calculate new allocation total
                const newAllocationTotal = allocations.reduce((s, a) => s + Number(a.amount), 0);
                if (existingTotal + newAllocationTotal > Number(payment.amount) + 0.01) {
                    throw new Error(
                        `Over-allocation: Payment is ₹${payment.amount}, already allocated ₹${existingTotal.toFixed(2)}, ` +
                        `attempting to allocate ₹${newAllocationTotal.toFixed(2)} more. Max remaining: ₹${(Number(payment.amount) - existingTotal).toFixed(2)}`
                    );
                }

                const createdAllocations = [];

                for (const alloc of allocations) {
                    if (!alloc.orderId || !alloc.amount || Number(alloc.amount) <= 0) {
                        throw new Error('Each allocation must have orderId and positive amount');
                    }

                    // Fetch invoice
                    const order = await db.order.findByPk(alloc.orderId, { transaction });
                    if (!order) {
                        throw new Error(`Invoice ${alloc.orderId} not found`);
                    }
                    if (order.isDeleted) {
                        throw new Error(`Invoice ${order.orderNumber} is deleted`);
                    }

                    // Check existing allocations for this specific invoice
                    const invoiceAllocations = await db.receiptAllocation.findAll({
                        where: { orderId: alloc.orderId, isDeleted: false },
                        transaction
                    });
                    const invoiceAllocatedTotal = invoiceAllocations.reduce((s, a) => s + Number(a.amount), 0);
                    const invoiceTotal = Number(order.total) || 0;

                    if (invoiceAllocatedTotal + Number(alloc.amount) > invoiceTotal + 0.01) {
                        throw new Error(
                            `Over-allocation on invoice ${order.orderNumber}: Total ₹${invoiceTotal}, ` +
                            `already allocated ₹${invoiceAllocatedTotal.toFixed(2)}, ` +
                            `attempting ₹${Number(alloc.amount).toFixed(2)}`
                        );
                    }

                    // Create allocation record
                    const allocation = await db.receiptAllocation.create({
                        paymentId,
                        orderId: alloc.orderId,
                        amount: Number(alloc.amount),
                        allocatedBy: req.user?.id,
                        allocatedByName: changedBy.trim(),
                        notes: alloc.notes || null
                    }, { transaction });

                    createdAllocations.push(allocation);

                    // Update the order's cached paidAmount/dueAmount/paymentStatus
                    const newInvoiceAllocated = invoiceAllocatedTotal + Number(alloc.amount);
                    const newDueAmount = Math.max(0, invoiceTotal - newInvoiceAllocated);
                    let newPaymentStatus = 'unpaid';
                    if (newInvoiceAllocated >= invoiceTotal) {
                        newPaymentStatus = 'paid';
                    } else if (newInvoiceAllocated > 0) {
                        newPaymentStatus = 'partial';
                    }

                    await db.order.update({
                        paidAmount: newInvoiceAllocated,
                        dueAmount: newDueAmount,
                        paymentStatus: newPaymentStatus
                    }, { where: { id: alloc.orderId }, transaction });

                    console.log(`[ALLOCATION] ${order.orderNumber}: allocated ₹${alloc.amount} from ${payment.paymentNumber} → due now ₹${newDueAmount.toFixed(2)} (${newPaymentStatus})`);
                }

                return createdAllocations;
            });

            // Audit log
            await createAuditLog({
                userId: req.user?.id,
                userName: changedBy.trim(),
                userRole: req.user?.role || 'unknown',
                action: 'CREATE',
                entityType: 'RECEIPT_ALLOCATION',
                entityId: paymentId,
                entityName: `Allocation for payment ${paymentId}`,
                newValues: { allocations },
                description: `${changedBy.trim()} allocated payment against ${allocations.length} invoice(s)`,
                ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                userAgent: req.headers['user-agent']
            });

            return res.status(200).json({
                status: 200,
                message: `Successfully allocated against ${allocations.length} invoice(s)`,
                data: result
            });

        } catch (error) {
            console.error('Receipt allocation error:', error);
            return res.status(400).json({
                status: 400,
                message: error.message
            });
        }
    },

    /**
     * Get allocations for a specific payment
     */
    getPaymentAllocations: async (req, res) => {
        try {
            const { paymentId } = req.params;
            const allocations = await db.receiptAllocation.findAll({
                where: { paymentId, isDeleted: false },
                order: [['createdAt', 'ASC']]
            });

            // Get payment info
            const payment = await db.payment.findByPk(paymentId);
            const totalAllocated = allocations.reduce((s, a) => s + Number(a.amount), 0);

            return res.status(200).json({
                status: 200,
                data: {
                    payment,
                    allocations,
                    totalAllocated,
                    unallocated: payment ? Math.max(0, Number(payment.amount) - totalAllocated) : 0
                }
            });
        } catch (error) {
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Get allocations for a specific invoice/order
     */
    getInvoiceAllocations: async (req, res) => {
        try {
            const { orderId } = req.params;
            const allocations = await db.receiptAllocation.findAll({
                where: { orderId, isDeleted: false },
                order: [['createdAt', 'ASC']]
            });

            const order = await db.order.findByPk(orderId);
            const totalAllocated = allocations.reduce((s, a) => s + Number(a.amount), 0);

            return res.status(200).json({
                status: 200,
                data: {
                    order: order ? {
                        id: order.id,
                        orderNumber: order.orderNumber,
                        total: order.total,
                        paidAmount: order.paidAmount,
                        dueAmount: order.dueAmount,
                        paymentStatus: order.paymentStatus
                    } : null,
                    allocations,
                    totalAllocated,
                    derivedDue: order ? Math.max(0, Number(order.total) - totalAllocated) : 0
                }
            });
        } catch (error) {
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * Delete (soft) a receipt allocation.
     * This reverses the allocation — increases invoice due amount.
     */
    deleteAllocation: async (req, res) => {
        try {
            const { allocationId } = req.params;
            const { changedBy } = req.body;

            if (!changedBy || !changedBy.trim()) {
                return res.status(400).json({ status: 400, message: 'changedBy is required' });
            }

            await db.sequelize.transaction(async (transaction) => {
                const allocation = await db.receiptAllocation.findByPk(allocationId, { transaction });
                if (!allocation || allocation.isDeleted) {
                    throw new Error('Allocation not found or already deleted');
                }

                // Soft delete the allocation
                await allocation.update({ isDeleted: true }, { transaction });

                // Recalculate order's cached payment fields
                const remainingAllocations = await db.receiptAllocation.findAll({
                    where: { orderId: allocation.orderId, isDeleted: false },
                    transaction
                });
                const totalAllocated = remainingAllocations.reduce((s, a) => s + Number(a.amount), 0);

                const order = await db.order.findByPk(allocation.orderId, { transaction });
                if (order) {
                    const total = Number(order.total) || 0;
                    const newDue = Math.max(0, total - totalAllocated);
                    let status = 'unpaid';
                    if (totalAllocated >= total) status = 'paid';
                    else if (totalAllocated > 0) status = 'partial';

                    await db.order.update({
                        paidAmount: totalAllocated,
                        dueAmount: newDue,
                        paymentStatus: status
                    }, { where: { id: allocation.orderId }, transaction });
                }
            });

            await createAuditLog({
                userId: req.user?.id,
                userName: changedBy.trim(),
                userRole: req.user?.role || 'unknown',
                action: 'DELETE',
                entityType: 'RECEIPT_ALLOCATION',
                entityId: allocationId,
                description: `${changedBy.trim()} removed receipt allocation`,
                ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                userAgent: req.headers['user-agent']
            });

            return res.status(200).json({
                status: 200,
                message: 'Allocation removed successfully'
            });

        } catch (error) {
            console.error('Delete allocation error:', error);
            return res.status(400).json({ status: 400, message: error.message });
        }
    }
};
