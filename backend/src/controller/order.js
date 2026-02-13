
const uuidv4 = require('uuid/v4');
const Services = require('../services');
const Validations = require('../validations');
const db = require('../models');
const { createAuditLog } = require('../middleware/auditLogger');

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

                // If this is a credit sale (unpaid/partial) with customer info, create/update customer record
                if (orderObj.dueAmount > 0 && orderObj.customerName && orderObj.customerName.trim()) {
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
                            // Update existing customer's balance
                            await existingCustomer.update({
                                currentBalance: (Number(existingCustomer.currentBalance) || 0) + orderObj.dueAmount
                            }, { transaction });
                            orderObj.customerId = existingCustomer.id;
                        } else {
                            // Create new customer
                            const newCustomer = await db.customer.create({
                                id: uuidv4(),
                                name: orderObj.customerName.trim(),
                                mobile: orderObj.customerMobile || null,
                                address: orderObj.customerAddress || null,
                                openingBalance: 0,
                                currentBalance: orderObj.dueAmount
                            }, { transaction });
                            orderObj.customerId = newCustomer.id;
                        }
                    } catch (customerError) {
                        console.error('Failed to create/update customer:', customerError);
                        // Continue with order - don't fail for customer creation issues
                    }
                }

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
                            console.log(`Reversed customer ${customer.name} balance by ₹${dueAmount}`);
                        }
                    } catch (custError) {
                        console.error('Failed to reverse customer balance:', custError);
                    }
                }

                // Delete ledger entries for this order
                await db.ledgerEntry.destroy({
                    where: {
                        referenceType: 'order',
                        referenceId: orderId
                    },
                    transaction
                });

                // Soft delete the order
                await db.order.update(
                    { isDeleted: true },
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
            const { newStatus, customerName, customerMobile, customerId } = req.body;

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
            
            // Use transaction for all updates to ensure data integrity
            const result = await db.sequelize.transaction(async (transaction) => {
                // Update order payment status and customer info
                const updateData = {
                    paymentStatus: newStatus,
                    paidAmount: newStatus === 'paid' ? order.total : 0,
                    dueAmount: newStatus === 'paid' ? 0 : order.total,
                    modifiedBy: req.user?.id,
                    modifiedByName: req.user?.name || req.user?.username
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
                
                return customerIdToUpdate;
            });

            // Create audit log (outside transaction - non-critical)
            await createAuditLog({
                userId: req.user?.id,
                userName: req.user?.name || req.user?.username,
                userRole: req.user?.role || 'unknown',
                action: 'UPDATE',
                entityType: 'ORDER_PAYMENT_STATUS',
                entityId: orderId,
                entityName: order.orderNumber,
                oldValues: { paymentStatus: oldStatus, paidAmount: order.paidAmount },
                newValues: { paymentStatus: newStatus, paidAmount: newStatus === 'paid' ? order.total : 0 },
                description: `Changed payment status from ${oldStatus} to ${newStatus} for order ${order.orderNumber}`,
                ipAddress: getClientIP(req),
                userAgent: req.headers['user-agent']
            });

            // Get updated order
            const updatedOrder = await Services.order.getOrder({ id: orderId });

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
