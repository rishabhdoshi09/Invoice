
const uuidv4 = require('uuid/v4');
const Services = require('../services');
const Validations = require('../validations');
const db = require('../models');
const { createAuditLog } = require('../middleware/auditLogger');
const { postInvoiceToLedger, reverseInvoiceLedger, postPaymentStatusToggleToLedger, postInvoiceCashReceiptToLedger } = require('../services/realTimeLedger');
const { assertOrderInvariants } = require('../services/orderInvariants');
const { updateStock, reverseAllBatchesForReference } = require('../services/accountingEngine');
const telegram = require('../services/telegramAlert');

// Helper to get client IP
const getClientIP = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           'unknown';
};

module.exports = {
    createOrder: async (req, res) => {
        try {
            // Validate first WITHOUT invoice number
            const { error, value } = Validations.order.validateCreateOrderObj(req.body);
            
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            let { orderItems, ...orderObj } = value;

            // === SERVER-SIDE MATH: Ignore client totals entirely ===
            // Recalculate every monetary field from the raw line items.
            const round2 = (n) => Math.round(n * 100) / 100;

            // 1. Recompute each line total (qty × rate)
            orderItems = orderItems.map(item => ({
                ...item,
                totalPrice: round2(item.quantity * item.productPrice)
            }));

            // 2. Recompute subTotal from line totals
            const computedSubTotal = round2(orderItems.reduce((s, i) => s + i.totalPrice, 0));

            // 3. Recompute tax from taxPercent (if supplied) or accept as a rate on subTotal
            const taxPercent = typeof orderObj.taxPercent === 'number' ? orderObj.taxPercent : 0;
            const computedTax = round2(computedSubTotal * taxPercent / 100);

            // 4. Grand total
            const computedTotal = round2(computedSubTotal + computedTax);

            // Override client-supplied values with server-computed values
            orderObj.subTotal = computedSubTotal;
            orderObj.tax = computedTax;
            orderObj.taxPercent = taxPercent;
            orderObj.total = computedTotal;

            // paidAmount MUST be explicitly set by frontend.
            // No default to "fully paid" — prevents silent data corruption.
            if (orderObj.paidAmount === undefined || orderObj.paidAmount === null) {
                orderObj.paidAmount = 0; // Default: unpaid (safe default)
            }
            orderObj.paidAmount = round2(orderObj.paidAmount);

            // PHASE 1 FIX (C1/C2/C8): Capture the POS cash as an immutable field.
            // originalPaidAmount is set ONCE here and protected by a DB trigger.
            // All future paidAmount values are DERIVED:
            //   paidAmount = originalPaidAmount + SUM(active receipt_allocations)
            // This makes it structurally impossible for allocation delete/undo to
            // erase the POS cash component.
            orderObj.originalPaidAmount = orderObj.paidAmount;

            // dueAmount / advanceAmount: mutually exclusive, both always >= 0
            //   dueAmount     = MAX(0, total - paidAmount)  → customer still owes us
            //   advanceAmount = MAX(0, paidAmount - total)  → excess becomes advance credit
            orderObj.dueAmount     = round2(Math.max(0, orderObj.total - orderObj.paidAmount));
            orderObj.advanceAmount = round2(Math.max(0, orderObj.paidAmount - orderObj.total));

            if (orderObj.paidAmount === 0) {
                orderObj.paymentStatus = 'unpaid';
                orderObj.paymentMode = 'CREDIT';
            } else if (orderObj.paidAmount >= orderObj.total) {
                orderObj.paymentStatus = 'paid';
                orderObj.paymentMode = 'CASH';
            } else {
                orderObj.paymentStatus = 'partial';
                orderObj.paymentMode = 'CREDIT'; // Partial at POS is still a credit sale
            }

            // Add created by user info
            if (req.user) {
                orderObj.createdBy = req.user.id;
                orderObj.createdByName = req.user.name || req.user.username;
            }

            // IDEMPOTENCY: If client supplies a key, return existing order on duplicate
            if (orderObj.idempotencyKey) {
                const existing = await db.order.findOne({
                    where: { idempotencyKey: orderObj.idempotencyKey }
                });
                if (existing) {
                    console.log(`[IDEMPOTENCY] Duplicate order request for key ${orderObj.idempotencyKey} — returning existing order ${existing.orderNumber}`);
                    return res.status(200).send({
                        status: 200,
                        message: 'order created successfully',
                        data: existing,
                        idempotent: true
                    });
                }
            }

            let linkSuggestion = null;
            const result = await db.sequelize.transaction(async (transaction) => {
                // Generate invoice number INSIDE transaction (only if everything else is valid)
                const invoiceInfo = await Services.invoiceSequence.generateInvoiceNumber(transaction);
                orderObj.orderNumber = invoiceInfo.invoiceNumber;
                
                // Customer linking — NOTHING happens silently.
                // If explicit customerId passed from frontend → trust it (user already confirmed)
                // If only customerName → search for match, DON'T auto-link, return suggestion
                // If no match → create new customer
                const hasCustomerName = orderObj.customerName && orderObj.customerName.trim();
                const hasCustomerMobile = orderObj.customerMobile && orderObj.customerMobile.trim();
                
                if (orderObj.customerId) {
                    // Frontend explicitly passed customerId — user confirmed the link.
                    // Use atomic increment to avoid lost-update under concurrent orders (CRIT-06).
                    if (orderObj.dueAmount > 0) {
                        await db.customer.update(
                            { currentBalance: db.sequelize.literal(`"currentBalance" + ${orderObj.dueAmount}`) },
                            { where: { id: orderObj.customerId }, transaction }
                        );
                    }
                    console.log(`Order: CONFIRMED link to customer ID ${orderObj.customerId}`);
                } else if (hasCustomerName || hasCustomerMobile) {
                    // Search for existing match — propagate errors so the transaction rolls back (MED-05)
                    let existingCustomer = null;
                    if (hasCustomerMobile) {
                        existingCustomer = await db.customer.findOne({
                            where: { mobile: orderObj.customerMobile.trim() },
                            transaction
                        });
                    }
                    if (!existingCustomer && hasCustomerName) {
                        existingCustomer = await db.customer.findOne({
                            where: db.Sequelize.where(
                                db.Sequelize.fn('LOWER', db.Sequelize.fn('TRIM', db.Sequelize.col('name'))),
                                orderObj.customerName.trim().toLowerCase()
                            ),
                            transaction
                        });
                    }

                    if (existingCustomer) {
                        // Match found — DON'T auto-link. Return suggestion for frontend.
                        linkSuggestion = {
                            customerId: existingCustomer.id,
                            name: existingCustomer.name,
                            mobile: existingCustomer.mobile,
                            currentBalance: existingCustomer.currentBalance
                        };
                        console.log(`Order: Match found "${existingCustomer.name}" — NOT auto-linked. Awaiting user confirmation.`);
                    } else {
                        // No match — create new customer. Error propagates to roll back the transaction.
                        const customerName = hasCustomerName ? orderObj.customerName.trim() : orderObj.customerMobile.trim();
                        const newCustomer = await db.customer.create({
                            id: uuidv4(),
                            name: customerName,
                            mobile: hasCustomerMobile ? orderObj.customerMobile.trim() : null,
                            address: orderObj.customerAddress || null,
                            openingBalance: 0,
                            currentBalance: orderObj.dueAmount > 0 ? orderObj.dueAmount : 0
                        }, { transaction });
                        orderObj.customerId = newCustomer.id;
                        console.log(`Order: CREATED new customer "${customerName}" (ID: ${newCustomer.id})`);
                    }
                }
                
                // NOW create the order with customerId set
                const response = await Services.order.createOrder(orderObj, transaction);
                const orderId = response.id;

                orderItems = orderItems.map((item, index) => { 
                    return {
                        ...item, 
                        orderId: orderId,
                        sortOrder: item.sortOrder !== undefined ? item.sortOrder : index
                    }; 
                });
                await Services.orderItems.addOrderItems(orderItems, transaction);

                // Deduct stock for each item that has a linked product
                for (const item of orderItems) {
                    if (item.productId) {
                        await updateStock(
                            item.productId,
                            Number(item.quantity),
                            'OUT',
                            orderId,
                            'sale',
                            transaction,
                            orderObj.orderDate || new Date()
                        );
                    }
                }

                // Update daily summary
                try {
                    await Services.dailySummary.recordOrderCreated(response, transaction);
                } catch (summaryError) {
                    console.error('Failed to update daily summary:', summaryError);
                    // Don't fail the order creation for summary issues
                }

                // === NEW DOUBLE-ENTRY LEDGER: Real-time posting ===
                // Non-blocking when CoA is not initialized; blocking (throws) when it IS initialized.
                // Posted for ALL orders, including walk-in (no customerId) — postInvoiceToLedger
                // and postInvoiceCashReceiptToLedger both use a generic Walk-in Customer account
                // when customerId is null, so every sale gets a journal entry.
                const accountsExist = await db.account.count({ transaction });
                if (accountsExist > 0) {
                    await postInvoiceToLedger(
                        { ...orderObj, id: orderId, createdAt: new Date() },
                        transaction
                    );
                    if (orderObj.paidAmount > 0) {
                        await postInvoiceCashReceiptToLedger(
                            { ...orderObj, id: orderId, createdAt: new Date() },
                            transaction
                        );
                    }
                } else {
                    console.warn(`[LEDGER] SKIP: Chart of Accounts not initialized — invoice ${orderObj.orderNumber} not posted to ledger`);
                }

                // === PRE-COMMIT INVARIANT CHECK (Phase 4) ===
                // Runs inside the transaction. Any violation throws InvariantError
                // which rolls back the entire transaction — nothing is persisted.
                // skipLedgerCheck=true because ledger posting just happened above;
                // the check for INV-7 is done separately after postInvoiceToLedger.
                await assertOrderInvariants(orderId, transaction, { skipLedgerCheck: true });

                const createdOrder = await Services.order.getOrder({id: orderId }, transaction);

                // Audit log INSIDE transaction — failure rolls back the order write.
                await createAuditLog({
                    userId: req.user?.id,
                    userName: req.user?.name || req.user?.username || 'Anonymous',
                    userRole: req.user?.role || 'unknown',
                    action: 'CREATE',
                    entityType: 'ORDER',
                    entityId: createdOrder.id,
                    entityName: createdOrder.orderNumber,
                    newValues: {
                        orderNumber: createdOrder.orderNumber,
                        total: createdOrder.total,
                        customerName: createdOrder.customerName,
                        itemCount: orderItems.length
                    },
                    description: `Created order ${createdOrder.orderNumber} for ₹${createdOrder.total}`,
                    ipAddress: getClientIP(req),
                    userAgent: req.headers['user-agent'],
                    transaction
                });

                return createdOrder;
            });

            // Mark recent weight fetches as consumed for this user
            try {
                const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
                await db.weightLog.update(
                    { consumed: true, orderId: result.id, orderNumber: result.orderNumber },
                    { where: {
                        userId: req.user?.id,
                        consumed: false,
                        createdAt: { [db.Sequelize.Op.gte]: fiveMinAgo }
                    }}
                );
            } catch (e) { /* silent */ }

            // Fire live Telegram alert for new bill (async, non-blocking)
            telegram.alertOrderCreated({
                orderNumber: result.orderNumber,
                customerName: result.customerName,
                total: result.total,
                paidAmount: result.paidAmount,
                dueAmount: result.dueAmount,
                paymentStatus: result.paymentStatus,
                items: orderItems,
                createdBy: req.user?.name || req.user?.username
            }).catch(e => console.error('[TELEGRAM] alertOrderCreated error:', e.message));

            return res.status(200).send({
                status: 200,
                message: 'order created successfully',
                data: result,
                linkSuggestion: linkSuggestion || undefined
            });

        } catch (error) {
            console.error('Create order error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            });
        }
    },
    
    listOrders: async (req, res) => {
        try {
            const { error, value } = Validations.order.validateListOrdersObj(req.query);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const response = await Services.order.listOrders(value);

            return res.status(200).send({
                status: 200,
                message: 'orders fetched successfully',
                data: response
            });

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error
            });
        }
    },
    
    getOrder: async (req, res) => {
        try {
            const response = await Services.order.getOrder({ id: req.params.orderId });

            if (response) {
                return res.status(200).send({
                    status: 200,
                    message: 'order fetched successfully',
                    data: response
                });
            }

            return res.status(400).send({
                status: 400,
                message: "order doesn't exist"
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error
            });
        }
    },
    
    updateOrder: async(req, res) => {
        try {
            // Check if user has permission to edit
            if (req.user && req.user.role !== 'admin') {
                return res.status(403).send({
                    status: 403,
                    message: 'Only administrators can edit orders'
                });
            }

            const orderId = req.params.orderId;
            const { orderItems, ...orderData } = req.body;
            
            // Get original order for audit
            const originalOrder = await Services.order.getOrder({ id: orderId });
            if (!originalOrder) {
                return res.status(400).send({
                    status: 400,
                    message: "order doesn't exist"
                });
            }
            
            console.log(`Updating order ${orderId}...`);

            // INVOICE IMMUTABILITY GUARD: Prevent direct mutation of financial fields
            // These fields can only change through proper receipt/adjustment entries
            const IMMUTABLE_FINANCIAL_FIELDS = ['paidAmount', 'dueAmount', 'paymentStatus'];
            const attemptedFinancialChanges = IMMUTABLE_FINANCIAL_FIELDS.filter(f => orderData[f] !== undefined);
            if (attemptedFinancialChanges.length > 0) {
                console.warn(`[IMMUTABILITY] Blocked direct edit of financial fields: ${attemptedFinancialChanges.join(', ')} on order ${orderId}`);
                return res.status(400).send({
                    status: 400,
                    message: `Cannot directly edit payment fields (${attemptedFinancialChanges.join(', ')}). Use "Record Payment" or adjustment entries instead.`
                });
            }
            
            // Update order in transaction
            const result = await db.sequelize.transaction(async (transaction) => {
                // Update order basic info (exclude orderItems from update)
                const { orderItems: _, ...updateFields } = orderData;

                // Add modified by info
                if (req.user) {
                    updateFields.modifiedBy = req.user.id;
                    updateFields.modifiedByName = req.user.name || req.user.username;
                }

                // === SERVER-SIDE MATH: Recalculate totals if line items are being edited ===
                const round2 = (n) => Math.round(n * 100) / 100;
                let financialFieldsChanged = false;

                if (orderItems && orderItems.length > 0) {
                    const recomputedItems = orderItems.map(item => ({
                        ...item,
                        totalPrice: round2(item.quantity * item.productPrice)
                    }));
                    const computedSubTotal = round2(recomputedItems.reduce((s, i) => s + i.totalPrice, 0));
                    const taxPercent = typeof updateFields.taxPercent === 'number'
                        ? updateFields.taxPercent
                        : (typeof originalOrder.taxPercent === 'number' ? originalOrder.taxPercent : 0);
                    const computedTax = round2(computedSubTotal * taxPercent / 100);
                    const computedTotal = round2(computedSubTotal + computedTax);

                    updateFields.subTotal = computedSubTotal;
                    updateFields.tax = computedTax;
                    updateFields.total = computedTotal;
                    // Recalculate dueAmount / advanceAmount (paidAmount stays — only receipt/toggle can change it)
                    const currentPaid = Number(originalOrder.paidAmount) || 0;
                    updateFields.dueAmount     = round2(Math.max(0, computedTotal - currentPaid));
                    updateFields.advanceAmount = round2(Math.max(0, currentPaid - computedTotal));

                    financialFieldsChanged = Math.abs(computedTotal - Number(originalOrder.total)) > 0.001;

                    // Bulk update line items
                    const updatePromises = recomputedItems.map(item =>
                        db.orderItems.update(
                            {
                                quantity: item.quantity,
                                productPrice: item.productPrice,
                                totalPrice: item.totalPrice
                            },
                            { where: { id: item.id }, transaction }
                        )
                    );
                    await Promise.all(updatePromises);
                }

                await Services.order.updateOrder(
                    { id: orderId },
                    updateFields,
                    transaction
                );

                // === L5 IMMUTABLE LEDGER: Reverse old entries and re-post if total changed ===
                if (financialFieldsChanged) {
                    // Fetch the updated order for ledger posting
                    const updatedOrder = await db.order.findOne({ where: { id: orderId }, transaction });
                    try {
                        await reverseInvoiceLedger(originalOrder, transaction);
                        await postInvoiceToLedger(updatedOrder, transaction);
                        // C8 FIX: When re-posting the cash receipt after an edit we must use
                        // the ORIGINAL creation-time paidAmount (from the existing INVOICE_CASH
                        // batch), NOT updatedOrder.paidAmount which may have grown due to receipt
                        // allocations added after invoice creation.  Using the current paidAmount
                        // would double-count all subsequent allocations as POS cash.
                        // The reverseInvoiceLedger call above already reversed the original
                        // INVOICE_CASH batch.  We re-post only if the original had POS cash.
                        // C8 FIX: Use originalPaidAmount (immutable POS cash set at creation),
                        // NOT paidAmount (which includes post-creation receipt allocations).
                        const originalPaidAtCreation = Number(originalOrder.originalPaidAmount) || 0;
                        if (originalPaidAtCreation > 0) {
                            // Re-post using original creation-time paid amount, not current
                            await postInvoiceCashReceiptToLedger(
                                { ...updatedOrder.get({ plain: true }), paidAmount: originalPaidAtCreation },
                                transaction
                            );
                        }
                        console.log(`[LEDGER] Edit corrected: reversed + reposted invoice ${updatedOrder.orderNumber}`);
                    } catch (ledgerErr) {
                        console.error(`[LEDGER] Edit reversal/repost failed for ${orderId}: ${ledgerErr.message}`);
                        throw ledgerErr; // block the edit if ledger is misconfigured
                    }
                }

                // === PRE-COMMIT INVARIANT CHECK (Phase 4) ===
                await assertOrderInvariants(orderId, transaction, { skipLedgerCheck: false });

                // Audit log INSIDE transaction — failure rolls back the order update (HIGH-11)
                const updatedForAudit = await db.order.findOne({ where: { id: orderId }, transaction });
                await createAuditLog({
                    userId:     req.user?.id,
                    userName:   req.user?.name || req.user?.username || 'Anonymous',
                    userRole:   req.user?.role || 'unknown',
                    action:     'UPDATE',
                    entityType: 'ORDER',
                    entityId:   orderId,
                    entityName: originalOrder.orderNumber,
                    oldValues: {
                        total:         originalOrder.total,
                        customerName:  originalOrder.customerName,
                        paymentStatus: originalOrder.paymentStatus
                    },
                    newValues: {
                        total:         updatedForAudit?.total,
                        customerName:  updatedForAudit?.customerName,
                        paymentStatus: updatedForAudit?.paymentStatus
                    },
                    description: `Updated order ${originalOrder.orderNumber}`,
                    ipAddress:   getClientIP(req),
                    userAgent:   req.headers['user-agent'],
                    transaction
                });

                return orderId;
            });

            // Fetch complete order data after transaction
            const completeOrder = await Services.order.getOrder({ id: result });

            console.log(`Order ${orderId} updated successfully`);
            
            return res.status(200).send({
                status: 200,
                message: 'order updated successfully',
                data: completeOrder
            });
            
        } catch(error) {
            console.error('Update order error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            });
        }
    },
    
    deleteOrder: async(req, res) => {
        try {
            // Check if user has permission to delete
            if (req.user && req.user.role !== 'admin') {
                return res.status(403).send({
                    status: 403,
                    message: 'Only administrators can delete orders'
                });
            }

            const orderId = req.params.orderId;
            
            // Get order details before deletion for audit
            const order = await Services.order.getOrder({ id: orderId });
            if (!order) {
                return res.status(400).send({
                    status: 400,
                    message: "order doesn't exist"
                });
            }

            // Prevent deleting already-deleted orders
            if (order.isDeleted) {
                return res.status(400).send({
                    status: 400,
                    message: 'This invoice has already been deleted'
                });
            }

            // Use transaction for all delete operations
            await db.sequelize.transaction(async (transaction) => {
                // Update daily summary to subtract deleted order
                try {
                    await Services.dailySummary.recordOrderDeleted(order, transaction);
                } catch (summaryError) {
                    console.error('Failed to update daily summary for deletion:', summaryError);
                }

                // Reverse customer balance atomically.
                // On create: currentBalance += dueAmount (if dueAmount > 0).
                // On delete: reverse that — currentBalance -= dueAmount.
                // advanceAmount (overpayment) never affected currentBalance on create, so nothing to reverse there.
                if (order.customerId && Number(order.dueAmount) > 0) {
                    await db.customer.update(
                        { currentBalance: db.sequelize.literal(`"currentBalance" - ${Number(order.dueAmount)}`) },
                        { where: { id: order.customerId }, transaction }
                    );
                    console.log(`[DELETE] Reversed customer balance by ₹${order.dueAmount} for order ${order.orderNumber}`);
                }

                // Reverse stock: add back the units deducted when this order was created
                if (order.orderItems && order.orderItems.length > 0) {
                    for (const item of order.orderItems) {
                        if (item.productId) {
                            await updateStock(
                                item.productId,
                                Number(item.quantity),
                                'IN',
                                order.id,
                                'sale_reversal',
                                transaction
                            );
                        }
                    }
                }

                // Create REVERSAL journal batch in the new ledger (swap debit/credit)
                try {
                    await reverseInvoiceLedger(order, transaction);
                } catch (ledgerError) {
                    console.error(`[LEDGER] Invoice reversal failed for ${order.orderNumber}:`, ledgerError.message);
                    throw ledgerError;
                }

                // Soft-delete any payments that were recorded specifically against this order.
                // These are receipts tied to this invoice (referenceType='order', referenceId=orderId).
                // On-account payments (referenceId=null) are left untouched.
                const linkedPayments = await db.payment.findAll({
                    where: { referenceId: orderId, referenceType: 'order', isDeleted: false },
                    transaction
                });
                for (const lp of linkedPayments) {
                    // Reverse the payment's ledger entries
                    try { await reversePaymentLedger(lp, transaction); } catch (e) { console.warn(`[DELETE] Ledger reversal skipped for payment ${lp.paymentNumber}:`, e.message); }
                    // Restore customer balance
                    if (lp.partyId) {
                        await db.customer.update(
                            { currentBalance: db.sequelize.literal(`"currentBalance" + ${Number(lp.amount)}`) },
                            { where: { id: lp.partyId }, transaction }
                        );
                    }
                    await db.payment.update(
                        { isDeleted: true, deletedAt: new Date(), deletedBy: req.user?.id || null, deletedByName: req.user?.name || req.user?.username || null },
                        { where: { id: lp.id }, transaction }
                    );
                    console.log(`[DELETE] Soft-deleted linked payment ${lp.paymentNumber} (₹${lp.amount}) for order ${order.orderNumber}`);
                }

                // Soft delete the order (preserve old ledger entries for audit trail)
                await db.order.update(
                    {
                        isDeleted: true,
                        deletedAt: new Date(),
                        deletedBy: req.user?.id || null,
                        deletedByName: req.user?.name || req.user?.username || null
                    },
                    { where: { id: orderId }, transaction }
                );
            });

            // Audit log for order deletion
            await createAuditLog({
                userId: req.user?.id,
                userName: req.user?.name || req.user?.username || 'Anonymous',
                userRole: req.user?.role || 'unknown',
                action: 'DELETE',
                entityType: 'ORDER',
                entityId: orderId,
                entityName: order.orderNumber,
                oldValues: {
                    orderNumber: order.orderNumber,
                    total: order.total,
                    customerName: order.customerName,
                    orderDate: order.orderDate,
                    items: order.orderItems?.map(i => ({
                        name: i.name,
                        quantity: i.quantity,
                        price: i.productPrice
                    }))
                },
                description: `DELETED order ${order.orderNumber} (₹${order.total}) - Customer: ${order.customerName}`,
                ipAddress: getClientIP(req),
                userAgent: req.headers['user-agent'],
                metadata: {
                    deletedAt: new Date().toISOString(),
                    reason: req.body.reason || 'No reason provided'
                }
            });

            // Also log to bill tampering audit
            try {
                await db.billAuditLog.create({
                    eventType: 'BILL_DELETED',
                    userId: req.user?.id || null,
                    userName: req.user?.name || req.user?.username || 'unknown',
                    invoiceContext: order.orderNumber,
                    orderId: orderId,
                    productName: `${order.orderItems?.length || 0} item(s)`,
                    totalPrice: order.total,
                    billTotal: order.total,
                    customerName: order.customerName || null,
                    billSnapshot: order.orderItems?.map(i => ({
                        name: i.name,
                        qty: i.quantity,
                        total: i.totalPrice
                    })),
                    deviceInfo: req.headers['user-agent']
                });
            } catch (e) { /* silent */ }

            // Fire live Telegram alert
            telegram.alertBillDeleted({
                orderNumber: order.orderNumber,
                total: order.total,
                customerName: order.customerName,
                user: req.user?.name || req.user?.username,
                timestamp: new Date()
            });
            
            return res.status(200).send({
                status: 200,
                message: 'order deleted successfully',
                data: { id: orderId }
            });
            
        } catch(error) {
            console.error('Delete order error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            });
        }
    },

    // Add staff notes to order (accessible by both admin and billing_staff)
    addStaffNote: async(req, res) => {
        try {
            const orderId = req.params.orderId;
            const { note } = req.body;

            if (!note || !note.trim()) {
                return res.status(400).send({
                    status: 400,
                    message: 'Note cannot be empty'
                });
            }

            // Get order
            const order = await Services.order.getOrder({ id: orderId });
            if (!order) {
                return res.status(400).send({
                    status: 400,
                    message: "Order doesn't exist"
                });
            }

            // Append new note with timestamp
            const timestamp = new Date().toISOString();
            const userName = req.user?.name || req.user?.username || 'Unknown';
            const newNote = `[${timestamp}] ${userName}: ${note.trim()}`;
            
            const existingNotes = order.staffNotes || '';
            const updatedNotes = existingNotes 
                ? `${existingNotes}\n${newNote}`
                : newNote;

            // Update order with new note
            await Services.order.updateOrder(
                { id: orderId },
                { 
                    staffNotes: updatedNotes,
                    staffNotesUpdatedAt: new Date(),
                    staffNotesUpdatedBy: userName
                }
            );

            // Audit log
            await createAuditLog({
                userId: req.user?.id,
                userName: userName,
                userRole: req.user?.role || 'unknown',
                action: 'UPDATE',
                entityType: 'ORDER_NOTE',
                entityId: orderId,
                entityName: order.orderNumber,
                newValues: { note: note.trim() },
                description: `Added note to order ${order.orderNumber}`,
                ipAddress: getClientIP(req),
                userAgent: req.headers['user-agent']
            });

            // Get updated order
            const updatedOrder = await Services.order.getOrder({ id: orderId });

            return res.status(200).send({
                status: 200,
                message: 'Note added successfully',
                data: updatedOrder
            });

        } catch(error) {
            console.error('Add staff note error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            });
        }
    },

    /**
     * Toggle payment status between 'paid' and 'unpaid'
     * Used for quick status changes from the orders list
     */
    togglePaymentStatus: async (req, res) => {
        try {
            const { orderId } = req.params;
            const { newStatus, customerName, customerMobile, customerId, changedBy } = req.body;

            // Validate changedBy name (mandatory for audit)
            if (!changedBy || !changedBy.trim()) {
                return res.status(400).send({
                    status: 400,
                    message: 'Your name is required to record this change.'
                });
            }

            // Validate new status
            if (!['paid', 'unpaid'].includes(newStatus)) {
                return res.status(400).send({
                    status: 400,
                    message: 'Invalid payment status. Must be "paid" or "unpaid".'
                });
            }

            // Require customer name when marking as unpaid
            if (newStatus === 'unpaid' && (!customerName || !customerName.trim())) {
                return res.status(400).send({
                    status: 400,
                    message: 'Customer name is required when marking order as unpaid.'
                });
            }

            // Get order
            const order = await Services.order.getOrder({ id: orderId });
            if (!order) {
                return res.status(404).send({
                    status: 404,
                    message: 'Order not found'
                });
            }

            const oldStatus = order.paymentStatus;
            const changedByTrimmed = changedBy.trim();
            
            // Use transaction for all updates to ensure data integrity
            const result = await db.sequelize.transaction(async (transaction) => {
                // Re-fetch order with row-level lock (FOR UPDATE) to prevent concurrent payment toggles
                const lockedOrder = await db.order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
                if (!lockedOrder) {
                    throw new Error('Order not found');
                }
                // Verify status hasn't changed since initial check
                if (lockedOrder.paymentStatus !== oldStatus) {
                    throw new Error(`Payment status was already changed to "${lockedOrder.paymentStatus}" by another user. Please refresh and try again.`);
                }

                // Update order payment status.
                // paidAmount is kept consistent with the status so financial state is never invalid
                // (dueAmount=0 with paidAmount=0 would create a ghost receivable).
                // paymentMode NEVER changes (CASH/CREDIT is determined at creation).
                const updateData = {
                    paymentStatus: newStatus,
                    paidAmount: newStatus === 'paid' ? order.total : 0,
                    dueAmount: newStatus === 'paid' ? 0 : order.total,
                    modifiedBy: req.user?.id,
                    modifiedByName: changedByTrimmed // Use the provided name for audit
                };
                
                let customerIdToUpdate = customerId || order.customerId;
                
                // Add customer info if toggling to unpaid
                if (newStatus === 'unpaid') {
                    updateData.customerName = customerName.trim();
                    if (customerMobile && customerMobile.trim()) {
                        updateData.customerMobile = customerMobile.trim();
                    }
                    
                    // If customerId provided, link to existing customer
                    if (customerId) {
                        updateData.customerId = customerId;
                        customerIdToUpdate = customerId;
                    } 
                    // If no customerId but customerName provided, create new customer or find by name
                    else if (!customerIdToUpdate) {
                        // Try to find existing customer by mobile or name
                        let existingCustomer = null;
                        if (customerMobile && customerMobile.trim()) {
                            existingCustomer = await db.customer.findOne({
                                where: { mobile: customerMobile.trim() },
                                transaction
                            });
                        }
                        if (!existingCustomer) {
                            existingCustomer = await db.customer.findOne({
                                where: { name: customerName.trim() },
                                transaction
                            });
                        }
                        
                        if (existingCustomer) {
                            updateData.customerId = existingCustomer.id;
                            customerIdToUpdate = existingCustomer.id;
                        } else {
                            // Create new customer
                            const newCustomer = await db.customer.create({
                                id: uuidv4(),
                                name: customerName.trim(),
                                mobile: customerMobile?.trim() || null,
                                openingBalance: 0,
                                currentBalance: 0
                            }, { transaction });
                            updateData.customerId = newCustomer.id;
                            customerIdToUpdate = newCustomer.id;
                            console.log(`Toggle: CREATED new customer "${customerName.trim()}" (ID: ${newCustomer.id})`);
                        }
                    }
                }

                // Update the order
                await db.order.update(updateData, { 
                    where: { id: orderId }, 
                    transaction 
                });

                // NO synthetic PAY-TOGGLE payments — toggle is purely a status marker.
                // Actual cash flow is tracked via Customer Receipts (payment records).
                // paymentMode stays CASH/CREDIT as set at creation time.

                // Update daily summary when payment status changes
                await Services.dailySummary.recordPaymentStatusChange(order, oldStatus, newStatus, transaction);

                // Update customer balance atomically if customer exists.
                // Atomic SQL avoids lost-update races under concurrent toggle requests.
                if (customerIdToUpdate) {
                    // If marking as paid, reduce balance by dueAmount (what was owed before this toggle)
                    // If marking as unpaid, increase balance by total (creating the receivable)
                    const balanceChange = newStatus === 'paid'
                        ? -Number(lockedOrder.dueAmount)
                        : Number(lockedOrder.total);
                    if (balanceChange !== 0) {
                        await db.customer.update(
                            { currentBalance: db.sequelize.literal(`"currentBalance" + ${balanceChange}`) },
                            { where: { id: customerIdToUpdate }, transaction }
                        );
                    }
                }

                // === DOUBLE-ENTRY LEDGER: Post payment toggle ===
                // Non-blocking when CoA is not initialized; blocking when it IS initialized.
                if (customerIdToUpdate) {
                    const accountsExist = await db.account.count({ transaction });
                    if (accountsExist > 0) {
                        await postPaymentStatusToggleToLedger(
                            { ...order.toJSON ? order.toJSON() : order, customerId: customerIdToUpdate },
                            oldStatus,
                            newStatus,
                            changedByTrimmed,
                            transaction
                        );

                        // When toggling paid→unpaid for a CASH invoice (originalPaidAmount > 0),
                        // postPaymentStatusToggle skips because togglePaid = total - originalPaid = 0.
                        // The INVOICE_CASH batch from creation must be explicitly reversed here
                        // so it no longer shows as active while paidAmount = 0 (fixes INV-11).
                        if (oldStatus === 'paid' && newStatus === 'unpaid' &&
                            Number(lockedOrder.originalPaidAmount) > 0) {
                            await reverseAllBatchesForReference(
                                orderId,
                                `Cash reversed: ${order.orderNumber} toggled to unpaid by ${changedByTrimmed}`,
                                transaction,
                                'INVOICE_CASH'
                            );
                        }
                    } else {
                        console.warn(`[LEDGER] SKIP: Chart of Accounts not initialized — toggle for ${order.orderNumber} not posted to ledger`);
                    }
                }
                
                return customerIdToUpdate;
            });

            // Create audit log (outside transaction - non-critical)
            await createAuditLog({
                userId: req.user?.id,
                userName: changedByTrimmed,
                userRole: req.user?.role || 'unknown',
                action: 'ORDER_PAYMENT_STATUS',
                entityType: 'ORDER',
                entityId: orderId,
                entityName: order.orderNumber,
                oldValues: {
                    paymentStatus: oldStatus,
                    paidAmount: Number(order.paidAmount),
                    dueAmount: Number(order.dueAmount),
                    paymentMode: order.paymentMode
                },
                newValues: {
                    paymentStatus: newStatus,
                    paidAmount: newStatus === 'paid' ? Number(order.total) : 0,
                    dueAmount: newStatus === 'paid' ? 0 : Number(order.total),
                    paymentMode: order.paymentMode // paymentMode never changes
                },
                description: `Toggle: ${order.orderNumber} | ${oldStatus} → ${newStatus} | paymentMode: ${order.paymentMode} | by ${changedByTrimmed}`,
                ipAddress: getClientIP(req),
                userAgent: req.headers['user-agent']
            });

            // Get updated order
            const updatedOrder = await Services.order.getOrder({ id: orderId });

            // Fire Telegram alert (non-blocking)
            telegram.alertPaymentToggle({
                orderNumber: order.orderNumber,
                total: order.total,
                oldStatus,
                newStatus,
                changedBy: changedByTrimmed,
                customerName: order.customerName
            });

            return res.status(200).send({
                status: 200,
                message: `Payment status updated to ${newStatus}`,
                data: updatedOrder
            });

        } catch (error) {
            console.error('Toggle payment status error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            });
        }
    },

    /**
     * POST /api/orders/:orderId/confirm-link
     * Admin explicitly confirms linking an order to an existing customer after prompt.
     * Body: { customerId }
     */
    confirmLink: async (req, res) => {
        try {
            const { orderId } = req.params;
            const { customerId } = req.body;

            if (!customerId) return res.status(400).json({ status: 400, message: 'customerId required' });

            const order = await db.order.findByPk(orderId);
            if (!order) return res.status(404).json({ status: 404, message: 'Order not found' });

            const customer = await db.customer.findByPk(customerId);
            if (!customer) return res.status(404).json({ status: 404, message: 'Customer not found' });

            await db.sequelize.transaction(async (transaction) => {
                // Link order to existing customer
                await order.update({ customerId: customer.id }, { transaction });

                // Update customer balance atomically
                if (Number(order.dueAmount) > 0) {
                    await db.customer.update(
                        { currentBalance: db.sequelize.literal(`"currentBalance" + ${Number(order.dueAmount)}`) },
                        { where: { id: customer.id }, transaction }
                    );
                }
            });

            // Audit trail — confirm link
            await createAuditLog({
                userId: req.user?.id,
                userName: req.user?.name || req.user?.username || 'System',
                userRole: req.user?.role || 'unknown',
                action: 'CONFIRM_LINK',
                entityType: 'ORDER',
                entityId: orderId,
                entityName: order.orderNumber,
                newValues: { customerId: customer.id, customerName: customer.name },
                description: `Admin linked order ${order.orderNumber} to customer "${customer.name}"`,
                ipAddress: getClientIP(req),
                userAgent: req.headers['user-agent']
            }).catch(e => console.warn('[AUDIT] Confirm link log failed:', e.message));

            return res.status(200).json({
                status: 200,
                message: `Order ${order.orderNumber} linked to "${customer.name}".`,
                data: { orderId, customerId: customer.id, customerName: customer.name }
            });
        } catch (error) {
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    getOrderLogs: async (req, res) => {
        try {
            const { orderId } = req.params;

            const [auditLogs, billLogs] = await Promise.all([
                db.auditLog.findAll({
                    where: { entityId: orderId },
                    order: [['createdAt', 'DESC']],
                    limit: 50
                }),
                db.billAuditLog.findAll({
                    where: { orderId },
                    order: [['createdAt', 'DESC']],
                    limit: 50
                })
            ]);

            const combined = [
                ...auditLogs.map(l => ({
                    id: l.id,
                    source: 'audit',
                    action: l.action,
                    userName: l.userName || 'System',
                    userRole: l.userRole,
                    description: l.description || `${l.action} by ${l.userName || 'System'}`,
                    oldValues: l.oldValues,
                    newValues: l.newValues,
                    createdAt: l.createdAt
                })),
                ...billLogs.map(l => ({
                    id: l.id,
                    source: 'bill',
                    action: l.eventType,
                    userName: l.userName || 'System',
                    description: l.invoiceContext || l.eventType,
                    productName: l.productName,
                    quantity: l.quantity,
                    price: l.price,
                    billTotal: l.billTotal,
                    createdAt: l.createdAt
                }))
            ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            return res.status(200).json({ status: 200, data: combined });
        } catch (error) {
            return res.status(500).json({ status: 500, message: error.message });
        }
    }
}