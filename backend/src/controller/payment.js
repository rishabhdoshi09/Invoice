const uuidv4 = require('uuid/v4');
const Services = require('../services');
const Validations = require('../validations');
const db = require('../models');
const { postPaymentToLedger, reversePaymentLedger, postSupplierPaymentToLedger } = require('../services/realTimeLedger');
const { createAuditLog } = require('../middleware/auditLogger');

const getClientIP = (req) => req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';

module.exports = {
    createPayment: async (req, res) => {
        try {
            const { error, value } = Validations.payment.validateCreatePaymentObj({ ...req.body, paymentNumber: `PAY-${uuidv4().split('-')[0].toUpperCase()}` });
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            // REFERENCE INTEGRITY: validate referenced entity exists before creating payment
            if (value.referenceId) {
                if (value.referenceType === 'order') {
                    const referencedOrder = await db.order.findOne({
                        where: { id: value.referenceId, isDeleted: false }
                    });
                    if (!referencedOrder) {
                        return res.status(400).send({
                            status: 400,
                            message: `Referenced order (${value.referenceId}) does not exist or has been deleted`
                        });
                    }
                } else if (value.referenceType === 'purchase') {
                    const referencedPurchase = await db.purchaseBill.findOne({
                        where: { id: value.referenceId, isDeleted: false }
                    });
                    if (!referencedPurchase) {
                        return res.status(400).send({
                            status: 400,
                            message: `Referenced purchase bill (${value.referenceId}) does not exist or has been deleted`
                        });
                    }
                }
            }

            // IDEMPOTENCY: if caller supplied a key and we already have a payment for it,
            // return the existing record without side-effects (safe retry).
            if (value.idempotencyKey) {
                const existing = await db.payment.findOne({
                    where: { idempotencyKey: value.idempotencyKey, isDeleted: false }
                });
                if (existing) {
                    return res.status(200).send({
                        status: 200,
                        message: 'payment recorded successfully',
                        data: existing,
                        idempotent: true
                    });
                }
            }

            const result = await db.sequelize.transaction(async (transaction) => {
                const response = await Services.payment.createPayment(value, transaction);

                // ── Resolve partyId for customer/supplier payments ────────────────────
                // If partyId was not supplied, try to find or create the party by name.
                // All DB operations are within the transaction for atomicity.
                if (value.partyType === 'customer' && !response.partyId) {
                    if (value.partyName && value.partyName.trim()) {
                        let customer = await db.customer.findOne({
                            where: db.Sequelize.where(
                                db.Sequelize.fn('LOWER', db.Sequelize.fn('TRIM', db.Sequelize.col('name'))),
                                value.partyName.trim().toLowerCase()
                            ),
                            transaction
                        });
                        if (!customer) {
                            const uuidv4 = require('uuid/v4');
                            customer = await db.customer.create({
                                id: uuidv4(),
                                name: value.partyName.trim(),
                                mobile: value.partyMobile || null,
                                openingBalance: 0,
                                currentBalance: 0
                            }, { transaction });
                            console.log(`[PAYMENT] Created new customer from payment: "${customer.name}" (ID: ${customer.id})`);
                        }
                        await response.update({ partyId: customer.id }, { transaction });
                    }
                }

                if (value.partyType === 'supplier' && !response.partyId) {
                    if (value.partyName && value.partyName.trim()) {
                        let supplier = await db.supplier.findOne({
                            where: db.Sequelize.where(
                                db.Sequelize.fn('LOWER', db.Sequelize.fn('TRIM', db.Sequelize.col('name'))),
                                value.partyName.trim().toLowerCase()
                            ),
                            transaction
                        });
                        if (!supplier) {
                            const uuidv4 = require('uuid/v4');
                            supplier = await db.supplier.create({
                                id: uuidv4(),
                                name: value.partyName.trim(),
                                openingBalance: 0,
                                currentBalance: 0
                            }, { transaction });
                            console.log(`[PAYMENT] Created new supplier from payment: "${supplier.name}" (ID: ${supplier.id})`);
                        }
                        await response.update({ partyId: supplier.id }, { transaction });
                    }
                }

                // ── Double-entry ledger posting (AccountingEngine is sole source of truth) ──
                // The old single-entry ledger system has been removed. All postings go through
                // the AccountingEngine which produces balanced journal batches.
                const accountsExist = await db.account.count({ transaction });
                if (accountsExist > 0) {
                    if (value.partyType === 'customer') {
                        const customerIdForLedger = response.partyId || value.partyId;
                        await postPaymentToLedger(
                            { ...value, id: response.id, paymentNumber: response.paymentNumber, createdAt: new Date() },
                            customerIdForLedger,
                            value.partyName,
                            transaction
                        );
                    } else if (value.partyType === 'supplier') {
                        const supplierIdForLedger = response.partyId || value.partyId;
                        await postSupplierPaymentToLedger(
                            { ...value, id: response.id, paymentNumber: response.paymentNumber, createdAt: new Date() },
                            supplierIdForLedger,
                            value.partyName,
                            transaction
                        );
                    }
                } else {
                    console.warn(`[LEDGER] SKIP: Chart of Accounts not initialized — payment ${response.paymentNumber} not posted to ledger`);
                }

                // ── Purchase bill: update paidAmount/dueAmount with SELECT FOR UPDATE ────
                // Uses atomic increment on paidAmount to prevent lost-update races.
                // dueAmount clamped to 0 (overpayment stored as advanceAmount).
                if (value.referenceType === 'order' && value.referenceId) {
                    console.log(`[PAYMENT] Payment against order ${value.referenceId}: ₹${value.amount} — order status NOT auto-updated. Use Allocate tab.`);
                } else if (value.partyType === 'customer' && value.partyName && !value.referenceId) {
                    console.log(`[PAYMENT] On-Account receipt from ${value.partyName}: ₹${value.amount} — requires manual allocation`);
                } else if (value.referenceType === 'purchase' && value.referenceId) {
                    // Lock the row to prevent concurrent payment races
                    const purchase = await db.purchaseBill.findByPk(value.referenceId, {
                        transaction,
                        lock: transaction.LOCK.UPDATE
                    });
                    if (purchase) {
                        const round2 = (n) => Math.round(n * 100) / 100;
                        const newPaidAmount = round2((Number(purchase.paidAmount) || 0) + Number(value.amount));
                        const total = Number(purchase.total) || 0;
                        const newDueAmount     = round2(Math.max(0, total - newPaidAmount));
                        const newAdvanceAmount = round2(Math.max(0, newPaidAmount - total));
                        let paymentStatus = 'unpaid';
                        if (newPaidAmount >= total - 0.01) paymentStatus = 'paid';
                        else if (newPaidAmount > 0.01)    paymentStatus = 'partial';

                        await db.purchaseBill.update(
                            { paidAmount: newPaidAmount, dueAmount: newDueAmount, advanceAmount: newAdvanceAmount, paymentStatus },
                            { where: { id: value.referenceId }, transaction }
                        );

                        // Reduce supplier outstanding balance (atomic, inside transaction)
                        if (purchase.supplierId) {
                            await db.supplier.update(
                                { currentBalance: db.sequelize.literal(`"currentBalance" - ${Number(value.amount)}`) },
                                { where: { id: purchase.supplierId }, transaction }
                            );
                        }
                    }
                }

                // Audit log INSIDE transaction — failure rolls back the payment write.
                await createAuditLog({
                    userId: req.user?.id,
                    userName: req.user?.name || req.user?.username || 'System',
                    userRole: req.user?.role || 'unknown',
                    action: 'CREATE',
                    entityType: 'PAYMENT',
                    entityId: response.id,
                    entityName: response.paymentNumber,
                    oldValues: null,
                    newValues: {
                        paymentNumber: response.paymentNumber,
                        amount: Number(value.amount),
                        partyType: value.partyType,
                        partyName: value.partyName,
                        referenceType: value.referenceType || null,
                        paymentDate: value.paymentDate || null
                    },
                    description: `Payment created: ${response.paymentNumber} | ₹${value.amount} | ${value.partyName} (${value.partyType})`,
                    ipAddress: getClientIP(req),
                    userAgent: req.headers['user-agent'],
                    transaction
                });

                return response;
            });

            return res.status(200).send({
                status: 200,
                message: 'payment recorded successfully',
                data: result
            });

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },
    
    listPayments: async (req, res) => {
        try {
            const { error, value } = Validations.payment.validateListPaymentsObj(req.query);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const response = await Services.payment.listPayments(value);

            return res.status(200).send({
                status: 200,
                message: 'payments fetched successfully',
                data: response
            });

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },
    
    getPayment: async (req, res) => {
        try {
            const response = await Services.payment.getPayment({ id: req.params.paymentId });

            if (response) {
                return res.status(200).send({
                    status: 200,
                    message: 'payment fetched successfully',
                    data: response
                });
            }

            return res.status(400).send({
                status: 400,
                message: "payment doesn't exist"
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },
    
    deletePayment: async (req, res) => {
        try {
            const payment = await Services.payment.getPayment({ id: req.params.paymentId });
            
            if (!payment) {
                return res.status(400).send({
                    status: 400,
                    message: "payment doesn't exist"
                });
            }

            // Prevent deleting already-deleted payments
            if (payment.isDeleted) {
                return res.status(400).send({
                    status: 400,
                    message: 'This payment has already been deleted'
                });
            }

            // Use transaction for all reversal operations
            await db.sequelize.transaction(async (transaction) => {
                // Payment deleted. Order status is NOT auto-reversed.
                // Order status changes ONLY via explicit receipt allocation or manual toggle.
                if (payment.referenceType === 'order' && payment.referenceId) {
                    console.log(`[PAYMENT DELETE] Payment against order ${payment.referenceId} deleted: ₹${payment.amount} — order status NOT auto-reversed.`);
                } else if (payment.referenceType === 'purchase' && payment.referenceId) {
                    // Lock the row before reverting to prevent concurrent races
                    const purchase = await db.purchaseBill.findByPk(payment.referenceId, {
                        transaction,
                        lock: transaction.LOCK.UPDATE
                    });
                    if (purchase) {
                        const round2 = (n) => Math.round(n * 100) / 100;
                        const newPaidAmount    = round2(Math.max(0, (Number(purchase.paidAmount) || 0) - Number(payment.amount)));
                        const total            = Number(purchase.total) || 0;
                        const newDueAmount     = round2(Math.max(0, total - newPaidAmount));
                        const newAdvanceAmount = round2(Math.max(0, newPaidAmount - total));
                        let paymentStatus = 'unpaid';
                        if (newPaidAmount >= total - 0.01) paymentStatus = 'paid';
                        else if (newPaidAmount > 0.01)    paymentStatus = 'partial';

                        await db.purchaseBill.update(
                            { paidAmount: newPaidAmount, dueAmount: newDueAmount, advanceAmount: newAdvanceAmount, paymentStatus },
                            { where: { id: payment.referenceId }, transaction }
                        );

                        // Restore supplier outstanding balance atomically (HIGH-06).
                        // Atomic SQL increment — eliminates lost-update race under concurrent deletes.
                        if (purchase.supplierId) {
                            await db.supplier.update(
                                { currentBalance: db.sequelize.literal(`"currentBalance" + ${Number(payment.amount)}`) },
                                { where: { id: purchase.supplierId }, transaction }
                            );
                        }
                    }
                }

                // Reverse customer balance if this was a customer payment.
                // Atomic SQL increment — no read-modify-write race under concurrent deletes (HIGH-06).
                if (payment.partyType === 'customer' && payment.partyId) {
                    await db.customer.update(
                        { currentBalance: db.sequelize.literal(`"currentBalance" + ${Number(payment.amount)}`) },
                        { where: { id: payment.partyId }, transaction }
                    );
                }

                // Reverse supplier balance for standalone supplier payments (advance, etc.).
                // Purchase-linked reversals are handled above via the purchase block (HIGH-06).
                if (payment.partyType === 'supplier' && payment.partyId && payment.referenceType !== 'purchase') {
                    await db.supplier.update(
                        { currentBalance: db.sequelize.literal(`"currentBalance" + ${Number(payment.amount)}`) },
                        { where: { id: payment.partyId }, transaction }
                    );
                }

                // Create REVERSAL journal batch in the new ledger (swap debit/credit)
                // Blocking when CoA is initialized so delete and ledger are always in sync.
                const accountsExist = await db.account.count({ transaction });
                if (accountsExist > 0) {
                    await reversePaymentLedger(payment, transaction);
                }
                
                // Soft delete the payment (preserve for audit trail)
                await db.payment.update(
                    {
                        isDeleted: true,
                        deletedAt: new Date(),
                        deletedBy: req.user?.id || null,
                        deletedByName: req.user?.name || req.user?.username || null
                    },
                    { where: { id: req.params.paymentId }, transaction }
                );
            });

            // Audit trail — payment deleted
            await createAuditLog({
                userId: req.user?.id,
                userName: req.user?.name || req.user?.username || 'System',
                userRole: req.user?.role || 'unknown',
                action: 'DELETE',
                entityType: 'PAYMENT',
                entityId: payment.id,
                entityName: payment.paymentNumber,
                oldValues: {
                    paymentNumber: payment.paymentNumber,
                    amount: Number(payment.amount),
                    partyType: payment.partyType,
                    partyName: payment.partyName,
                    paymentDate: payment.paymentDate
                },
                newValues: null,
                description: `Payment deleted: ${payment.paymentNumber} | ₹${payment.amount} | ${payment.partyName} (${payment.partyType})`,
                ipAddress: getClientIP(req),
                userAgent: req.headers['user-agent']
            }).catch(e => console.warn('[AUDIT] Payment delete log failed:', e.message));

            return res.status(200).send({
                status: 200,
                message: 'payment deleted successfully',
                data: { id: req.params.paymentId }
            });
            
        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });            
        }
    },

    getDailySummary: async (req, res) => {
        try {
            const date = req.query.date || new Date().toISOString().split('T')[0];
            
            // Get all payments for the specific date
            const { rows: payments } = await Services.payment.listPayments({
                date: date,
                limit: 1000,
                offset: 0
            });

            // Calculate summaries — force Number() since Sequelize may return strings
            const totalAmount = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const customerPayments = payments.filter(p => p.partyType === 'customer');
            const supplierPayments = payments.filter(p => p.partyType === 'supplier');
            const expensePayments = payments.filter(p => p.partyType === 'expense');
            
            const customerTotal = customerPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const supplierTotal = supplierPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const expenseTotal = expensePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

            // Group by reference type
            const orderPayments = payments.filter(p => p.referenceType === 'order');
            const purchasePayments = payments.filter(p => p.referenceType === 'purchase');
            const advancePayments = payments.filter(p => p.referenceType === 'advance');

            return res.status(200).send({
                status: 200,
                message: 'daily summary fetched successfully',
                data: {
                    date: date,
                    totalCount: payments.length,
                    totalAmount: totalAmount,
                    summary: {
                        customers: {
                            count: customerPayments.length,
                            amount: customerTotal
                        },
                        suppliers: {
                            count: supplierPayments.length,
                            amount: supplierTotal
                        },
                        expenses: {
                            count: expensePayments.length,
                            amount: expenseTotal
                        }
                    },
                    byReferenceType: {
                        orders: {
                            count: orderPayments.length,
                            amount: orderPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
                        },
                        purchases: {
                            count: purchasePayments.length,
                            amount: purchasePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
                        },
                        advances: {
                            count: advancePayments.length,
                            amount: advancePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
                        }
                    },
                    payments: payments
                }
            });

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },

    updatePayment: async (req, res) => {
        try {
            const { paymentId } = req.params;
            const { amount, paymentDate, notes } = req.body;

            const payment = await db.payment.findOne({ where: { id: paymentId, isDeleted: false } });
            if (!payment) {
                return res.status(404).send({ status: 404, message: 'Payment not found' });
            }

            const oldAmount = Number(payment.amount) || 0;
            const newAmount = amount !== undefined ? Number(amount) : oldAmount;
            if (newAmount <= 0) {
                return res.status(400).send({ status: 400, message: 'Amount must be greater than 0' });
            }

            await db.sequelize.transaction(async (transaction) => {
                const amountDiff = newAmount - oldAmount;

                if (amountDiff !== 0) {
                    // Update customer balance atomically (positive diff = more paid = balance decreases)
                    if (payment.partyType === 'customer' && payment.partyId) {
                        await db.customer.update(
                            { currentBalance: db.sequelize.literal(`"currentBalance" - ${amountDiff}`) },
                            { where: { id: payment.partyId }, transaction }
                        );
                    }

                    // Ledger: reverse old batch then post new one with updated amount
                    const accountsExist = await db.account.count({ transaction });
                    if (accountsExist > 0) {
                        await reversePaymentLedger(payment, transaction);
                        const updatedPaymentData = { ...payment.toJSON(), amount: newAmount };
                        if (payment.partyType === 'customer') {
                            await postPaymentToLedger(updatedPaymentData, payment.partyId, payment.partyName, transaction);
                        } else if (payment.partyType === 'supplier') {
                            await postSupplierPaymentToLedger(updatedPaymentData, payment.partyId, payment.partyName, transaction);
                        }
                    }
                }

                const updateData = {};
                if (amount !== undefined) updateData.amount = newAmount;
                if (paymentDate !== undefined) updateData.paymentDate = paymentDate;
                if (notes !== undefined) updateData.notes = notes;

                await db.payment.update(updateData, { where: { id: paymentId }, transaction });
            });

            const updated = await db.payment.findByPk(paymentId);
            return res.status(200).send({ status: 200, message: 'Payment updated', data: updated });

        } catch (error) {
            console.error('Update payment error:', error);
            return res.status(500).send({ status: 500, message: error.message || 'Internal server error' });
        }
    }
};
