/**
 * Data Integrity Audit Controller
 * 
 * Diagnoses and fixes corrupted order payment data.
 * Compares each order's stored paidAmount/paymentStatus against
 * actual evidence (direct payments + receipt allocations).
 * 
 * ALL fixes require explicit user authorization — no automatic corrections.
 */
const db = require('../models');
const { createAuditLog } = require('../middleware/auditLogger');

module.exports = {
    /**
     * AUDIT: Scan all orders and find mismatches between stored paidAmount
     * and actual payment evidence.
     * 
     * READ-ONLY — no data is modified.
     * 
     * Uses batch queries for performance (handles thousands of orders).
     * 
     * Query params:
     *   - customerId (optional): filter to a specific customer
     *   - onlyMismatches (optional, default true): only show orders where stored != actual
     */
    auditOrders: async (req, res) => {
        try {
            const { customerId, onlyMismatches = 'true' } = req.query;
            const showOnlyMismatches = onlyMismatches !== 'false';

            // Build order filter
            const orderWhere = { isDeleted: false };
            if (customerId) {
                orderWhere.customerId = customerId;
            }

            // Batch 1: Get all orders
            const orders = await db.order.findAll({
                where: orderWhere,
                order: [['orderDate', 'DESC'], ['createdAt', 'DESC']],
                raw: true
            });

            if (orders.length === 0) {
                return res.status(200).json({
                    status: 200,
                    message: 'No orders found.',
                    data: { totalScanned: 0, totalMismatched: 0, orders: [] }
                });
            }

            const orderIds = orders.map(o => o.id);

            // Batch 2: Get ALL direct payments referencing orders, in one query
            const paymentWhere = {
                referenceType: 'order',
                referenceId: { [db.Sequelize.Op.in]: orderIds },
                partyType: 'customer'
            };
            if (db.payment.rawAttributes.isDeleted) {
                paymentWhere.isDeleted = false;
            }
            const allPayments = await db.payment.findAll({ where: paymentWhere, raw: true });

            // Index payments by referenceId (orderId)
            const paymentsByOrder = {};
            for (const p of allPayments) {
                if (!paymentsByOrder[p.referenceId]) paymentsByOrder[p.referenceId] = [];
                paymentsByOrder[p.referenceId].push(p);
            }

            // Batch 3: Get ALL receipt allocations for these orders, in one query
            let allocationsByOrder = {};
            try {
                const allAllocations = await db.receiptAllocation.findAll({
                    where: { orderId: { [db.Sequelize.Op.in]: orderIds }, isDeleted: false },
                    raw: true
                });
                for (const a of allAllocations) {
                    if (!allocationsByOrder[a.orderId]) allocationsByOrder[a.orderId] = [];
                    allocationsByOrder[a.orderId].push(a);
                }
            } catch (e) {
                // receipt_allocations table might not exist
            }

            // Now process in memory — no more DB calls
            const mismatches = [];
            let totalScanned = 0;
            let totalMismatched = 0;

            for (const order of orders) {
                totalScanned++;

                const directPayments = paymentsByOrder[order.id] || [];
                const directPaymentTotal = directPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

                const allocations = allocationsByOrder[order.id] || [];
                const allocationTotal = allocations.reduce((s, a) => s + Number(a.amount || 0), 0);

                // Actual evidence-based paid amount (take the higher of the two sources)
                const evidencePaid = Math.max(directPaymentTotal, allocationTotal);
                const orderTotal = Number(order.total) || 0;
                const storedPaid = Number(order.paidAmount) || 0;

                // Compute what status SHOULD be
                let correctStatus = 'unpaid';
                if (evidencePaid >= orderTotal && orderTotal > 0) correctStatus = 'paid';
                else if (evidencePaid > 0) correctStatus = 'partial';

                const correctDue = Math.max(0, orderTotal - evidencePaid);

                // Check if there's a mismatch
                const paidMismatch = Math.abs(storedPaid - evidencePaid) > 0.01;
                const statusMismatch = order.paymentStatus !== correctStatus;
                const hasMismatch = paidMismatch || statusMismatch;

                if (hasMismatch) totalMismatched++;

                if (!showOnlyMismatches || hasMismatch) {
                    mismatches.push({
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        orderDate: order.orderDate,
                        customerName: order.customerName,
                        customerId: order.customerId,
                        orderTotal,
                        stored: {
                            paidAmount: storedPaid,
                            dueAmount: Number(order.dueAmount),
                            paymentStatus: order.paymentStatus
                        },
                        evidence: {
                            directPaymentTotal,
                            allocationTotal,
                            evidencePaid,
                            correctDue,
                            correctStatus
                        },
                        directPaymentCount: directPayments.length,
                        hasMismatch
                    });
                }
            }

            return res.status(200).json({
                status: 200,
                message: `Scanned ${totalScanned} orders. Found ${totalMismatched} with mismatched payment data.`,
                data: {
                    totalScanned,
                    totalMismatched,
                    orders: mismatches
                }
            });

        } catch (error) {
            console.error('Audit orders error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * FIX selected orders: Reset paidAmount/dueAmount/paymentStatus
     * to match actual payment evidence.
     * 
     * Requires explicit user authorization (changedBy).
     * 
     * Body: {
     *   orderIds: string[] (UUIDs of orders to fix, or ['all'] for all mismatched),
     *   changedBy: string (name for audit trail)
     * }
     */
    fixOrders: async (req, res) => {
        try {
            const { orderIds, changedBy } = req.body;

            if (!changedBy || !changedBy.trim()) {
                return res.status(400).json({ status: 400, message: 'changedBy (your name) is required for audit trail' });
            }

            const fixAll = !orderIds || orderIds.length === 0 || (orderIds.length === 1 && orderIds[0] === 'all');

            // Build order filter
            const orderWhere = { isDeleted: false };
            if (!fixAll) {
                orderWhere.id = { [db.Sequelize.Op.in]: orderIds };
            }

            const result = await db.sequelize.transaction(async (transaction) => {
                const orders = await db.order.findAll({
                    where: orderWhere,
                    transaction,
                    lock: transaction.LOCK.UPDATE
                });

                const allOrderIds = orders.map(o => o.id);

                // Batch: Get all direct payments for these orders
                const paymentWhere = {
                    referenceType: 'order',
                    referenceId: { [db.Sequelize.Op.in]: allOrderIds },
                    partyType: 'customer'
                };
                if (db.payment.rawAttributes.isDeleted) {
                    paymentWhere.isDeleted = false;
                }
                const allPayments = await db.payment.findAll({ where: paymentWhere, transaction, raw: true });
                const paymentsByOrder = {};
                for (const p of allPayments) {
                    if (!paymentsByOrder[p.referenceId]) paymentsByOrder[p.referenceId] = [];
                    paymentsByOrder[p.referenceId].push(p);
                }

                // Batch: Get all allocations
                let allocationsByOrder = {};
                try {
                    const allAllocations = await db.receiptAllocation.findAll({
                        where: { orderId: { [db.Sequelize.Op.in]: allOrderIds }, isDeleted: false },
                        transaction, raw: true
                    });
                    for (const a of allAllocations) {
                        if (!allocationsByOrder[a.orderId]) allocationsByOrder[a.orderId] = [];
                        allocationsByOrder[a.orderId].push(a);
                    }
                } catch (e) { /* table might not exist */ }

                const fixed = [];

                for (const order of orders) {
                    const directPayments = paymentsByOrder[order.id] || [];
                    const directPaymentTotal = directPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

                    const allocations = allocationsByOrder[order.id] || [];
                    const allocationTotal = allocations.reduce((s, a) => s + Number(a.amount || 0), 0);

                    const evidencePaid = Math.max(directPaymentTotal, allocationTotal);
                    const orderTotal = Number(order.total) || 0;
                    const storedPaid = Number(order.paidAmount) || 0;

                    let correctStatus = 'unpaid';
                    if (evidencePaid >= orderTotal && orderTotal > 0) correctStatus = 'paid';
                    else if (evidencePaid > 0) correctStatus = 'partial';

                    const correctDue = Math.max(0, orderTotal - evidencePaid);

                    const paidMismatch = Math.abs(storedPaid - evidencePaid) > 0.01;
                    const statusMismatch = order.paymentStatus !== correctStatus;

                    if (paidMismatch || statusMismatch) {
                        await db.order.update({
                            paidAmount: evidencePaid,
                            dueAmount: correctDue,
                            paymentStatus: correctStatus
                        }, { where: { id: order.id }, transaction });

                        fixed.push({
                            orderNumber: order.orderNumber,
                            customerName: order.customerName,
                            before: {
                                paidAmount: storedPaid,
                                dueAmount: Number(order.dueAmount),
                                paymentStatus: order.paymentStatus
                            },
                            after: {
                                paidAmount: evidencePaid,
                                dueAmount: correctDue,
                                paymentStatus: correctStatus
                            }
                        });
                    }
                }

                return fixed;
            });

            // Audit log
            await createAuditLog({
                userId: req.user?.id,
                userName: changedBy.trim(),
                userRole: req.user?.role || 'unknown',
                action: 'DATA_INTEGRITY_FIX',
                entityType: 'ORDER',
                entityId: fixAll ? 'all-mismatched' : orderIds.join(','),
                description: `${changedBy.trim()} fixed payment data on ${result.length} orders based on actual payment evidence`,
                newValues: { fixedCount: result.length },
                ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
                userAgent: req.headers['user-agent']
            });

            return res.status(200).json({
                status: 200,
                message: `Fixed ${result.length} orders. Payment data now matches actual payment evidence.`,
                data: {
                    fixedCount: result.length,
                    orders: result
                }
            });

        } catch (error) {
            console.error('Fix orders error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    }
};
