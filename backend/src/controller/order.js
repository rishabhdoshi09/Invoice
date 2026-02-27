
const uuidv4 = require('uuid/v4');
const Services = require('../services');
const Validations = require('../validations');
const db = require('../models');
const { createAuditLog } = require('../middleware/auditLogger');
const { postInvoiceToLedger, reverseInvoiceLedger, postPaymentStatusToggleToLedger, postInvoiceCashReceiptToLedger } = require('../services/realTimeLedger');
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

            // Calculate payment status (most sales are cash, default to paid)
            // Use explicit check for undefined/null, not falsy (0 is valid for credit sales)
            if (orderObj.paidAmount === undefined || orderObj.paidAmount === null) {
                orderObj.paidAmount = orderObj.total; // Default: fully paid
            }
            orderObj.dueAmount = orderObj.total - orderObj.paidAmount;
            
            if (orderObj.paidAmount === 0) {
                orderObj.paymentStatus = 'unpaid';
            } else if (orderObj.paidAmount >= orderObj.total) {
                orderObj.paymentStatus = 'paid';
            } else {
                orderObj.paymentStatus = 'partial';
            }

            // Add created by user info
            if (req.user) {
                orderObj.createdBy = req.user.id;
                orderObj.createdByName = req.user.name || req.user.username;
            }

            const result = await db.sequelize.transaction(async (transaction) => {
                // Generate invoice number INSIDE transaction (only if everything else is valid)
                const invoiceInfo = await Services.invoiceSequence.generateInvoiceNumber(transaction);
                orderObj.orderNumber = invoiceInfo.invoiceNumber;
                
                // If customer info is provided, create/update customer record FIRST
                // This ensures customerId is set BEFORE the order is created
                // Link customers for ALL orders (paid or credit) when customer info is available
                if (orderObj.customerName && orderObj.customerName.trim()) {
                    try {
                        // Check if customer already exists by mobile or name
                        let existingCustomer = null;
                        if (orderObj.customerMobile) {
                            existingCustomer = await db.customer.findOne({
                                where: { mobile: orderObj.customerMobile },
                                transaction
                            });
                        }
                        if (!existingCustomer) {
                            existingCustomer = await db.customer.findOne({
                                where: { name: orderObj.customerName.trim() },
                                transaction
                            });
                        }

                        if (existingCustomer) {
                            // Update existing customer's balance (only for credit sales)
                            const updateData = {};
                            if (orderObj.dueAmount > 0) {
                                updateData.currentBalance = (Number(existingCustomer.currentBalance) || 0) + orderObj.dueAmount;
                            }
                            // Update mobile if customer doesn't have one but order does
                            if (!existingCustomer.mobile && orderObj.customerMobile) {
                                updateData.mobile = orderObj.customerMobile;
                            }
                            // Update address if customer doesn't have one but order does
                            if (!existingCustomer.address && orderObj.customerAddress) {
                                updateData.address = orderObj.customerAddress;
                            }
                            if (Object.keys(updateData).length > 0) {
                                await existingCustomer.update(updateData, { transaction });
                            }
                            orderObj.customerId = existingCustomer.id;
                            console.log(`Order: Linked to existing customer ${existingCustomer.name} (ID: ${existingCustomer.id})`);
                        } else {
                            // Create new customer
                            const newCustomer = await db.customer.create({
                                id: uuidv4(),
                                name: orderObj.customerName.trim(),
                                mobile: orderObj.customerMobile || null,
                                address: orderObj.customerAddress || null,
                                openingBalance: 0,
                                currentBalance: orderObj.dueAmount > 0 ? orderObj.dueAmount : 0
                            }, { transaction });
                            orderObj.customerId = newCustomer.id;
                            console.log(`Order: Created new customer ${newCustomer.name} (ID: ${newCustomer.id})`);
                        }
                    } catch (customerError) {
                        console.error('Failed to create/update customer:', customerError);
                        // Continue with order - don't fail for customer creation issues
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

                // Update daily summary
                try {
                    await Services.dailySummary.recordOrderCreated(response, transaction);
                } catch (summaryError) {
                    console.error('Failed to update daily summary:', summaryError);
                    // Don't fail the order creation for summary issues
                }

                // Dynamically get the Sales and Cash/Bank Ledger IDs
                const salesLedger = await Services.ledger.getLedgerByName('Sales Account');
                if (!salesLedger) {
                    throw new Error('Sales Ledger not found. Please create a ledger named "Sales Account".');
                }
                const cashBankLedger = await Services.ledger.getLedgerByName('Cash Account');
                if (!cashBankLedger) {
                    throw new Error('Cash Account Ledger not found. Please create a ledger named "Cash Account".');
                }

                const SALES_LEDGER_ID = salesLedger.id;
                const CASH_BANK_LEDGER_ID = cashBankLedger.id;

                // Create ledger entries for sale
                const ledgerEntries = [];
                
                // 1. Debit Customer/Receivable (if not fully paid)
                if (orderObj.dueAmount > 0 && orderObj.customerId) {
                    // Assuming customer has a ledgerId
                    const customer = await Services.customer.getCustomer({ id: orderObj.customerId });
                    if (customer && customer.ledgerId) {
                        ledgerEntries.push({
                            ledgerId: customer.ledgerId, 
                            entryDate: orderObj.orderDate,
                            debit: orderObj.dueAmount, // Receivable is debited (asset increases)
                            credit: 0,
                            description: `Sale to ${customer.name} (Due Amount)`,
                            referenceType: 'order',
                            referenceId: orderId
                        });
                    }
                }

                // 2. Debit Cash/Bank (if partially or fully paid)
                if (orderObj.paidAmount > 0) {
                    ledgerEntries.push({
                        ledgerId: CASH_BANK_LEDGER_ID, 
                        entryDate: orderObj.orderDate,
                        debit: orderObj.paidAmount, // Cash/Bank is debited (asset increases)
                        credit: 0,
                        description: `Sale to ${orderObj.customerName} (Paid Amount)`,
                        referenceType: 'order',
                        referenceId: orderId
                    });
                }

                // 3. Credit Sales
                ledgerEntries.push({
                    ledgerId: SALES_LEDGER_ID, 
                    entryDate: orderObj.orderDate,
                    debit: 0,
                    credit: orderObj.total, // Sales is credited (income increases)
                    description: `Sale to ${orderObj.customerName} (Total)`,
                    referenceType: 'order',
                    referenceId: orderId
                });

                if (ledgerEntries.length > 0) {
                    await db.ledgerEntry.bulkCreate(ledgerEntries, { transaction });
                }

                // === NEW DOUBLE-ENTRY LEDGER: Real-time posting ===
                // Non-blocking: if Chart of Accounts isn't set up, log warning but don't crash order creation
                if (orderObj.customerId) {
                    try {
                        const accountsExist = await db.account.count({ transaction });
                        if (accountsExist > 0) {
                            await postInvoiceToLedger(
                                { ...orderObj, id: orderId, createdAt: new Date() },
                                transaction
                            );
                            // If order is paid (fully or partially), also post the cash receipt
                            if (orderObj.paidAmount > 0) {
                                await postInvoiceCashReceiptToLedger(
                                    { ...orderObj, id: orderId, createdAt: new Date() },
                                    transaction
                                );
                            }
                        } else {
                            console.warn(`[LEDGER] SKIP: Chart of Accounts not initialized — invoice ${orderObj.orderNumber} not posted to ledger`);
                        }
                    } catch (ledgerError) {
                        console.error(`[LEDGER] Failed to post invoice ${orderObj.orderNumber}:`, ledgerError.message);
                        // Don't crash order creation — ledger posting is supplementary
                    }
                }

                return await Services.order.getOrder({id: orderId }, transaction);
            });

            // Audit log for order creation
            await createAuditLog({
                userId: req.user?.id,
                userName: req.user?.name || req.user?.username || 'Anonymous',
                userRole: req.user?.role || 'unknown',
                action: 'CREATE',
                entityType: 'ORDER',
                entityId: result.id,
                entityName: result.orderNumber,
                newValues: {
                    orderNumber: result.orderNumber,
                    total: result.total,
                    customerName: result.customerName,
                    itemCount: orderItems.length
                },
                description: `Created order ${result.orderNumber} for ₹${result.total}`,
                ipAddress: getClientIP(req),
                userAgent: req.headers['user-agent']
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

            // Fire live Telegram alert for new bill
            telegram.alertOrderCreated({
                orderNumber: result.orderNumber,
                customerName: result.customerName,
                total: result.total,
                paidAmount: result.paidAmount,
                dueAmount: result.dueAmount,
                paymentStatus: result.paymentStatus,
                items: orderItems,
                createdBy: req.user?.name || req.user?.username
            });

            return res.status(200).send({
                status: 200,
                message: 'order created successfully',
                data: result
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
            
            // Update order in transaction
            const result = await db.sequelize.transaction(async (transaction) => {
                // Update order basic info (exclude orderItems from update)
                const { orderItems: _, ...updateFields } = orderData;
                
                // Add modified by info
                if (req.user) {
                    updateFields.modifiedBy = req.user.id;
                    updateFields.modifiedByName = req.user.name || req.user.username;
                }
                
                await Services.order.updateOrder(
                    { id: orderId },
                    updateFields
                );
                
                // Update order items if provided
                if (orderItems && orderItems.length > 0) {
                    // Bulk update existing items instead of delete + insert
                    const updatePromises = orderItems.map(item => {
                        return db.orderItems.update(
                            {
                                quantity: item.quantity,
                                productPrice: item.productPrice,
                                totalPrice: item.totalPrice
                            },
                            {
                                where: { id: item.id },
                                transaction
                            }
                        );
                    });
                    
                    await Promise.all(updatePromises);
                }
                
                // Return updated order with items (fetch outside transaction for speed)
                return orderId;
            });
            
            // Fetch complete order data after transaction
            const completeOrder = await Services.order.getOrder({ id: result });
            
            // Audit log for order update
            await createAuditLog({
                userId: req.user?.id,
                userName: req.user?.name || req.user?.username || 'Anonymous',
                userRole: req.user?.role || 'unknown',
                action: 'UPDATE',
                entityType: 'ORDER',
                entityId: orderId,
                entityName: originalOrder.orderNumber,
                oldValues: {
                    total: originalOrder.total,
                    customerName: originalOrder.customerName,
                    paymentStatus: originalOrder.paymentStatus
                },
                newValues: {
                    total: completeOrder.total,
                    customerName: completeOrder.customerName,
                    paymentStatus: completeOrder.paymentStatus
                },
                description: `Updated order ${originalOrder.orderNumber}`,
                ipAddress: getClientIP(req),
                userAgent: req.headers['user-agent']
            });
            
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

                // CRITICAL: Reverse customer balance if this was a credit sale
                if (order.customerId && order.paymentStatus !== 'paid') {
                    try {
                        const customer = await db.customer.findByPk(order.customerId);
                        if (customer) {
                            const dueAmount = Number(order.dueAmount) || Number(order.total) || 0;
                            await customer.update({
                                currentBalance: Math.max(0, (Number(customer.currentBalance) || 0) - dueAmount)
                            }, { transaction });
                            console.log(`Reversed customer ${customer.name} balance by ${dueAmount}`);
                        }
                    } catch (custError) {
                        console.error('Failed to reverse customer balance:', custError);
                    }
                }

                // Create REVERSAL journal batch in the new ledger (swap debit/credit)
                try {
                    await reverseInvoiceLedger(order, transaction);
                } catch (ledgerError) {
                    console.error(`[LEDGER] Invoice reversal failed for ${order.orderNumber}:`, ledgerError.message);
                    throw ledgerError;
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
                // Update order payment status and customer info
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
                            // Use existing customer
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
                        }
                    }
                }

                // Update the order
                await db.order.update(updateData, { 
                    where: { id: orderId }, 
                    transaction 
                });

                // NOTE: We do NOT create a payment record when toggling to "paid"
                // The order's paidAmount already tracks the cash received
                // Creating a payment would cause DOUBLE COUNTING in daily summaries
                // (cashSales counts paidAmount, customerReceipts would count payment)
                
                // When marking as UNPAID (reversing a payment), delete any payment entries
                // that might have been created by old code or "Receive Payment" flow
                if (newStatus === 'unpaid' && oldStatus === 'paid') {
                    // Find and delete any payment entries linked to this order
                    await db.payment.destroy({
                        where: {
                            referenceId: orderId,
                            referenceType: 'order'
                        },
                        transaction
                    });
                }

                // Update daily summary when payment status changes
                await Services.dailySummary.recordPaymentStatusChange(order, oldStatus, newStatus, transaction);

                // Update customer balance if customer exists
                if (customerIdToUpdate) {
                    const customer = await db.customer.findByPk(customerIdToUpdate, { transaction });
                    if (customer) {
                        // If marking as paid, reduce customer balance
                        // If marking as unpaid, increase customer balance
                        const balanceChange = newStatus === 'paid' 
                            ? -Number(order.total)  // Reduce balance when paid
                            : Number(order.total);  // Increase balance when unpaid
                        
                        await customer.update({
                            currentBalance: Math.max(0, (Number(customer.currentBalance) || 0) + balanceChange)
                        }, { transaction });
                    }
                }

                // === DOUBLE-ENTRY LEDGER: Post payment toggle ===
                // Non-blocking: if Chart of Accounts isn't set up, log warning but don't crash
                if (customerIdToUpdate) {
                    try {
                        const accountsExist = await db.account.count({ transaction });
                        if (accountsExist > 0) {
                            await postPaymentStatusToggleToLedger(
                                { ...order.toJSON ? order.toJSON() : order, customerId: customerIdToUpdate },
                                oldStatus,
                                newStatus,
                                changedByTrimmed,
                                transaction
                            );
                        } else {
                            console.warn(`[LEDGER] SKIP: Chart of Accounts not initialized — toggle for ${order.orderNumber} not posted to ledger`);
                        }
                    } catch (ledgerError) {
                        console.error(`[LEDGER] Failed to post toggle for ${order.orderNumber}:`, ledgerError.message);
                        // Don't crash toggle — ledger posting is supplementary
                    }
                }
                
                return customerIdToUpdate;
            });

            // Create audit log (outside transaction - non-critical)
            await createAuditLog({
                userId: req.user?.id,
                userName: changedByTrimmed, // Use the provided name
                userRole: req.user?.role || 'unknown',
                action: 'UPDATE',
                entityType: 'ORDER_PAYMENT_STATUS',
                entityId: orderId,
                entityName: order.orderNumber,
                oldValues: { paymentStatus: oldStatus, paidAmount: order.paidAmount },
                newValues: { paymentStatus: newStatus, paidAmount: newStatus === 'paid' ? order.total : 0, changedBy: changedByTrimmed },
                description: `${changedByTrimmed} changed payment status from ${oldStatus} to ${newStatus} for order ${order.orderNumber}`,
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
}
