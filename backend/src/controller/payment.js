const { v4: uuidv4 } = require('uuid');
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

            // ── Human-readable log line for every payment ─────────────────────
            const arrow  = value.partyType === 'customer' ? '→ IN ' : '← OUT';
            const party  = value.partyType === 'customer' ? 'Customer' : 'Supplier';
            const amt    = `₹${Number(value.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const ref    = value.referenceId ? ` | Ref: ${value.referenceNumber || value.referenceId}` : '';
            console.log(`[PAYMENT] ${arrow} ${result.paymentNumber} ${amt} | ${party}: ${value.partyName}${ref} | ${value.paymentDate}`);

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

                // Audit log INSIDE the transaction — if this write fails the entire
                // deletion rolls back. A deleted payment with no audit trail is
                // indistinguishable from money that was never received.
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
                    userAgent: req.headers['user-agent'],
                    transaction
                });
            });

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

            // Use SQL aggregation — accurate at any volume, no 1000-record cap.
            // Previously this fetched up to 1000 payment rows and summed them in JS,
            // which silently truncated totals on busy days.
            const [aggRows] = await db.sequelize.query(`
                SELECT
                    "partyType",
                    "referenceType",
                    COUNT(*)                                       AS cnt,
                    COALESCE(SUM(CAST(amount AS NUMERIC)), 0)      AS total
                FROM payments
                WHERE "isDeleted" = false
                  AND (
                      "paymentDate" = :date
                      OR "paymentDate" = TO_CHAR(TO_DATE(:date, 'YYYY-MM-DD'), 'DD-MM-YYYY')
                      OR "paymentDate" = TO_CHAR(TO_DATE(:date, 'YYYY-MM-DD'), 'DD/MM/YYYY')
                  )
                GROUP BY "partyType", "referenceType"
            `, { replacements: { date } });

            // Fold aggregate rows into summary buckets
            const sum = (partyType, referenceType) => {
                const row = aggRows.find(r =>
                    r.partytype === partyType &&
                    (referenceType === null ? r.referencetype === null : r.referencetype === referenceType)
                );
                return row ? { count: Number(row.cnt), amount: Number(row.total) } : { count: 0, amount: 0 };
            };

            const allPartyTypes = [...new Set(aggRows.map(r => r.partytype))];
            const totalCount  = aggRows.reduce((s, r) => s + Number(r.cnt),   0);
            const totalAmount = aggRows.reduce((s, r) => s + Number(r.total), 0);

            const customerRows = aggRows.filter(r => r.partytype === 'customer');
            const supplierRows = aggRows.filter(r => r.partytype === 'supplier');
            const expenseRows  = aggRows.filter(r => r.partytype === 'expense');

            const customerTotal = customerRows.reduce((s, r) => s + Number(r.total), 0);
            const supplierTotal = supplierRows.reduce((s, r) => s + Number(r.total), 0);
            const expenseTotal  = expenseRows.reduce((s, r)  => s + Number(r.total), 0);
            const customerCount = customerRows.reduce((s, r) => s + Number(r.cnt),   0);
            const supplierCount = supplierRows.reduce((s, r) => s + Number(r.cnt),   0);
            const expenseCount  = expenseRows.reduce((s, r)  => s + Number(r.cnt),   0);

            const orderRows    = aggRows.filter(r => r.referencetype === 'order');
            const purchaseRows = aggRows.filter(r => r.referencetype === 'purchase');
            const advanceRows  = aggRows.filter(r => r.referencetype === 'advance');

            return res.status(200).send({
                status: 200,
                message: 'daily summary fetched successfully',
                data: {
                    date,
                    totalCount,
                    totalAmount,
                    summary: {
                        customers: { count: customerCount, amount: customerTotal },
                        suppliers: { count: supplierCount, amount: supplierTotal },
                        expenses:  { count: expenseCount,  amount: expenseTotal  }
                    },
                    byReferenceType: {
                        orders:    {
                            count:  orderRows.reduce((s, r) => s + Number(r.cnt),   0),
                            amount: orderRows.reduce((s, r) => s + Number(r.total), 0)
                        },
                        purchases: {
                            count:  purchaseRows.reduce((s, r) => s + Number(r.cnt),   0),
                            amount: purchaseRows.reduce((s, r) => s + Number(r.total), 0)
                        },
                        advances:  {
                            count:  advanceRows.reduce((s, r) => s + Number(r.cnt),   0),
                            amount: advanceRows.reduce((s, r) => s + Number(r.total), 0)
                        }
                    }
                }
            });

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    }
};
