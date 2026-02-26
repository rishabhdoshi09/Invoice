const uuidv4 = require('uuid/v4');
const Services = require('../services');
const Validations = require('../validations');
const db = require('../models');
const { postPaymentToLedger, reversePaymentLedger, postSupplierPaymentToLedger } = require('../services/realTimeLedger');

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

            const result = await db.sequelize.transaction(async (transaction) => {
                const response = await Services.payment.createPayment(value, transaction);

                // Dynamically get the Cash/Bank Ledger ID
                const cashBankLedger = await Services.ledger.getLedgerByName('Cash Account');
                if (!cashBankLedger) {
                    throw new Error('Cash Account Ledger not found. Please create a ledger named "Cash Account".');
                }
                const CASH_BANK_LEDGER_ID = cashBankLedger.id;
                
                // Create ledger entries for payment
                const ledgerEntries = [];

                if (value.partyType === 'customer') {
                    // Customer payment received: Cash/Bank (Debit) to Customer (Credit)
                    // Look up customer by partyId first, then by name
                    let customer = null;
                    if (value.partyId) {
                        customer = await Services.customer.getCustomer({ id: value.partyId });
                    }
                    
                    // If not found by ID, try to find or create by name
                    if (!customer && value.partyName && value.partyName.trim()) {
                        customer = await db.customer.findOne({ 
                            where: { name: value.partyName.trim() },
                            transaction
                        });
                        
                        // If customer doesn't exist, CREATE it
                        if (!customer) {
                            const uuidv4 = require('uuid/v4');
                            customer = await db.customer.create({
                                id: uuidv4(),
                                name: value.partyName.trim(),
                                mobile: value.partyMobile || null,
                                openingBalance: 0,
                                currentBalance: 0
                            }, { transaction });
                            console.log(`Created new customer from payment: ${customer.name} (ID: ${customer.id})`);
                        }
                        
                        // Update payment with the correct partyId
                        await response.update({ partyId: customer.id }, { transaction });
                    }
                    
                    // Always record the cash receipt
                    ledgerEntries.push({
                        ledgerId: CASH_BANK_LEDGER_ID,
                        entryDate: value.paymentDate,
                        debit: value.amount,
                        credit: 0,
                        description: `Payment received from ${value.partyName || customer?.name || 'Customer'} - ${value.referenceType}`,
                        referenceType: 'payment',
                        referenceId: response.id
                    });
                    
                    // If customer has a ledger, record the credit entry
                    if (customer && customer.ledgerId) {
                        ledgerEntries.push({
                            ledgerId: customer.ledgerId,
                            entryDate: value.paymentDate,
                            debit: 0,
                            credit: value.amount,
                            description: `Payment received from ${value.partyName || customer.name} - ${value.referenceType}`,
                            referenceType: 'payment',
                            referenceId: response.id
                        });
                    }
                    
                    // Update customer balance if found
                    if (customer) {
                        await customer.update({
                            currentBalance: Math.max(0, (customer.currentBalance || 0) - value.amount)
                        }, { transaction });
                    }
                } else if (value.partyType === 'supplier') {
                    // Supplier payment made: Supplier (Debit) to Cash/Bank (Credit)
                    // Look up supplier by partyId first, then by name
                    let supplier = null;
                    if (value.partyId) {
                        supplier = await Services.supplier.getSupplier({ id: value.partyId });
                    }
                    
                    // If not found by ID, try to find or create by name
                    if (!supplier && value.partyName && value.partyName.trim()) {
                        supplier = await db.supplier.findOne({ 
                            where: { name: value.partyName.trim() },
                            transaction
                        });
                        
                        // If supplier doesn't exist, CREATE it
                        if (!supplier) {
                            const uuidv4 = require('uuid/v4');
                            supplier = await db.supplier.create({
                                id: uuidv4(),
                                name: value.partyName.trim(),
                                openingBalance: 0,
                                currentBalance: 0
                            }, { transaction });
                            console.log(`Created new supplier from payment: ${supplier.name} (ID: ${supplier.id})`);
                        }
                        
                        // Update payment with the correct partyId
                        await response.update({ partyId: supplier.id }, { transaction });
                    }
                    
                    // Always record the cash payment
                    ledgerEntries.push({
                        ledgerId: CASH_BANK_LEDGER_ID,
                        entryDate: value.paymentDate,
                        debit: 0,
                        credit: value.amount,
                        description: `Payment to ${value.partyName || supplier?.name || 'Supplier'} - ${value.referenceType}`,
                        referenceType: 'payment',
                        referenceId: response.id
                    });
                    
                    // If supplier has a ledger, record the debit entry
                    if (supplier && supplier.ledgerId) {
                        ledgerEntries.push({
                            ledgerId: supplier.ledgerId,
                            entryDate: value.paymentDate,
                            debit: value.amount,
                            credit: 0,
                            description: `Payment to ${value.partyName || supplier.name} - ${value.referenceType}`,
                            referenceType: 'payment',
                            referenceId: response.id
                        });
                    }
                    
                    // Update supplier balance if found (reduce balance when payment is made)
                    if (supplier) {
                        await supplier.update({
                            currentBalance: Math.max(0, (supplier.currentBalance || 0) - value.amount)
                        }, { transaction });
                    }
                } else if (value.partyType === 'expense') {
                    // Simple expense: Cash/Bank (Credit) - money going out
                    // Try to get or create an Expenses ledger
                    let expenseLedger = await Services.ledger.getLedgerByName('Expenses');
                    if (!expenseLedger) {
                        // If no expense ledger, just record the cash outflow
                        ledgerEntries.push({
                            ledgerId: CASH_BANK_LEDGER_ID,
                            entryDate: value.paymentDate,
                            debit: 0,
                            credit: value.amount,
                            description: `Expense: ${value.partyName} - ${value.notes || ''}`,
                            referenceType: 'payment',
                            referenceId: response.id
                        });
                    } else {
                        // Double entry: Expense (Debit) to Cash/Bank (Credit)
                        ledgerEntries.push({
                            ledgerId: expenseLedger.id,
                            entryDate: value.paymentDate,
                            debit: value.amount,
                            credit: 0,
                            description: `Expense: ${value.partyName} - ${value.notes || ''}`,
                            referenceType: 'payment',
                            referenceId: response.id
                        });
                        ledgerEntries.push({
                            ledgerId: CASH_BANK_LEDGER_ID,
                            entryDate: value.paymentDate,
                            debit: 0,
                            credit: value.amount,
                            description: `Expense: ${value.partyName} - ${value.notes || ''}`,
                            referenceType: 'payment',
                            referenceId: response.id
                        });
                    }
                }

                if (ledgerEntries.length > 0) {
                    await db.ledgerEntry.bulkCreate(ledgerEntries, { transaction });
                }

                // === NEW DOUBLE-ENTRY LEDGER: Real-time posting ===
                // Non-blocking: if Chart of Accounts isn't set up, log warning but don't crash payment creation
                if (value.partyType === 'customer') {
                    try {
                        const accountsExist = await db.account.count({ transaction });
                        if (accountsExist > 0) {
                            const customerIdForLedger = response.partyId || value.partyId;
                            await postPaymentToLedger(
                                { ...value, id: response.id, paymentNumber: response.paymentNumber, createdAt: new Date() },
                                customerIdForLedger,
                                value.partyName,
                                transaction
                            );
                        } else {
                            console.warn(`[LEDGER] SKIP: Chart of Accounts not initialized — payment ${response.paymentNumber} not posted to ledger`);
                        }
                    } catch (ledgerError) {
                        console.error(`[LEDGER] Failed to post payment ${response.paymentNumber}:`, ledgerError.message);
                        // Don't crash payment creation — ledger posting is supplementary
                    }
                }

                // === NEW DOUBLE-ENTRY LEDGER: Supplier payment posting ===
                if (value.partyType === 'supplier') {
                    try {
                        const accountsExist = await db.account.count({ transaction });
                        if (accountsExist > 0) {
                            const supplierIdForLedger = response.partyId || value.partyId;
                            await postSupplierPaymentToLedger(
                                { ...value, id: response.id, paymentNumber: response.paymentNumber, createdAt: new Date() },
                                supplierIdForLedger,
                                value.partyName,
                                transaction
                            );
                        } else {
                            console.warn(`[LEDGER] SKIP: Chart of Accounts not initialized — supplier payment ${response.paymentNumber} not posted to ledger`);
                        }
                    } catch (ledgerError) {
                        console.error(`[LEDGER] Failed to post supplier payment ${response.paymentNumber}:`, ledgerError.message);
                    }
                }

                // Update reference (order or purchase) payment status
                if (value.referenceType === 'order' && value.referenceId) {
                    const order = await Services.order.getOrder({ id: value.referenceId }, transaction);
                    if (order) {
                        // Check if order is already paid - prevent double payment
                        if (order.paymentStatus === 'paid') {
                            throw new Error(`Order ${order.orderNumber} is already marked as paid. Cannot accept additional payment.`);
                        }
                        
                        const newPaidAmount = (order.paidAmount || 0) + value.amount;
                        const newDueAmount = order.total - newPaidAmount;
                        let paymentStatus = 'unpaid';
                        
                        if (newPaidAmount >= order.total) {
                            paymentStatus = 'paid';
                        } else if (newPaidAmount > 0) {
                            paymentStatus = 'partial';
                        }

                        await db.order.update(
                            { 
                                paidAmount: newPaidAmount, 
                                dueAmount: newDueAmount,
                                paymentStatus: paymentStatus
                            },
                            { where: { id: value.referenceId }, transaction }
                        );
                    }
                } else if (value.partyType === 'customer' && value.partyName && !value.referenceId) {
                    // Payment by customer name without specific order reference
                    // Find unpaid orders for this customer and apply payment
                    const unpaidOrders = await db.order.findAll({
                        where: {
                            customerName: value.partyName,
                            paymentStatus: ['unpaid', 'partial'],
                            isDeleted: false
                        },
                        order: [['orderDate', 'ASC']] // Pay oldest first
                    });

                    let remainingAmount = value.amount;
                    let firstOrderId = null; // Track the first order this payment was applied to
                    
                    for (const order of unpaidOrders) {
                        if (remainingAmount <= 0) break;
                        
                        const dueAmount = (order.dueAmount || order.total - (order.paidAmount || 0));
                        const paymentForThisOrder = Math.min(remainingAmount, dueAmount);
                        
                        const newPaidAmount = (order.paidAmount || 0) + paymentForThisOrder;
                        const newDueAmount = order.total - newPaidAmount;
                        let paymentStatus = 'unpaid';
                        
                        if (newPaidAmount >= order.total) {
                            paymentStatus = 'paid';
                        } else if (newPaidAmount > 0) {
                            paymentStatus = 'partial';
                        }

                        await order.update({ 
                            paidAmount: newPaidAmount, 
                            dueAmount: newDueAmount,
                            paymentStatus: paymentStatus
                        }, { transaction });

                        // Track the first order for reference
                        if (!firstOrderId) {
                            firstOrderId = order.id;
                        }

                        remainingAmount -= paymentForThisOrder;
                    }
                    
                    // CRITICAL: Update the payment record to link to the first order
                    // This prevents double-counting in cash drawer calculations
                    if (firstOrderId) {
                        await response.update({ 
                            referenceType: 'order',
                            referenceId: firstOrderId,
                            referenceNumber: unpaidOrders[0]?.orderNumber
                        }, { transaction });
                    }
                } else if (value.referenceType === 'purchase' && value.referenceId) {
                    const purchase = await Services.purchaseBill.getPurchaseBill({ id: value.referenceId });
                    if (purchase) {
                        const newPaidAmount = (purchase.paidAmount || 0) + value.amount;
                        const newDueAmount = purchase.total - newPaidAmount;
                        let paymentStatus = 'unpaid';
                        
                        if (newPaidAmount >= purchase.total) {
                            paymentStatus = 'paid';
                        } else if (newPaidAmount > 0) {
                            paymentStatus = 'partial';
                        }

                        await Services.purchaseBill.updatePurchaseBill(
                            { id: value.referenceId },
                            { 
                                paidAmount: newPaidAmount, 
                                dueAmount: newDueAmount,
                                paymentStatus: paymentStatus
                            }
                        );

                        // Update supplier balance
                        const supplier = await Services.supplier.getSupplier({ id: purchase.supplierId });
                        if (supplier) {
                            const newBalance = (supplier.currentBalance || 0) - value.amount;
                            await Services.supplier.updateSupplier(
                                { id: purchase.supplierId },
                                { currentBalance: newBalance }
                            );
                        }
                    }
                }

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
                // Reverse the payment updates on the referenced order/purchase
                if (payment.referenceType === 'order' && payment.referenceId) {
                    const order = await Services.order.getOrder({ id: payment.referenceId }, transaction);
                    if (order) {
                        const newPaidAmount = Math.max(0, (Number(order.paidAmount) || 0) - Number(payment.amount));
                        const newDueAmount = Number(order.total) - newPaidAmount;
                        let paymentStatus = 'unpaid';
                        
                        if (newPaidAmount >= Number(order.total)) {
                            paymentStatus = 'paid';
                        } else if (newPaidAmount > 0) {
                            paymentStatus = 'partial';
                        }

                        await db.order.update(
                            { 
                                paidAmount: newPaidAmount, 
                                dueAmount: newDueAmount,
                                paymentStatus: paymentStatus
                            },
                            { where: { id: payment.referenceId }, transaction }
                        );
                    }
                } else if (payment.referenceType === 'purchase' && payment.referenceId) {
                    const purchase = await Services.purchaseBill.getPurchaseBill({ id: payment.referenceId });
                    if (purchase) {
                        const newPaidAmount = Math.max(0, (Number(purchase.paidAmount) || 0) - Number(payment.amount));
                        const newDueAmount = Number(purchase.total) - newPaidAmount;
                        let paymentStatus = 'unpaid';
                        
                        if (newPaidAmount >= Number(purchase.total)) {
                            paymentStatus = 'paid';
                        } else if (newPaidAmount > 0) {
                            paymentStatus = 'partial';
                        }

                        await db.purchaseBill.update(
                            { 
                                paidAmount: newPaidAmount, 
                                dueAmount: newDueAmount,
                                paymentStatus: paymentStatus
                            },
                            { where: { id: payment.referenceId }, transaction }
                        );

                        // Update supplier balance (add back the payment amount)
                        if (purchase.supplierId) {
                            const supplier = await db.supplier.findByPk(purchase.supplierId);
                            if (supplier) {
                                await supplier.update({
                                    currentBalance: (Number(supplier.currentBalance) || 0) + Number(payment.amount)
                                }, { transaction });
                            }
                        }
                    }
                }
                
                // Reverse customer balance if this was a customer payment
                if (payment.partyType === 'customer' && payment.partyId) {
                    const customer = await db.customer.findByPk(payment.partyId);
                    if (customer) {
                        await customer.update({
                            currentBalance: (Number(customer.currentBalance) || 0) + Number(payment.amount)
                        }, { transaction });
                    }
                }

                // Create REVERSAL journal batch in the new ledger (swap debit/credit)
                try {
                    await reversePaymentLedger(payment, transaction);
                } catch (ledgerError) {
                    console.error(`[LEDGER] Payment reversal failed for ${payment.paymentNumber}:`, ledgerError.message);
                    throw ledgerError;
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

            // Calculate summaries
            const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
            const customerPayments = payments.filter(p => p.partyType === 'customer');
            const supplierPayments = payments.filter(p => p.partyType === 'supplier');
            const expensePayments = payments.filter(p => p.partyType === 'expense');
            
            const customerTotal = customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            const supplierTotal = supplierPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            const expenseTotal = expensePayments.reduce((sum, p) => sum + (p.amount || 0), 0);

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
                            amount: orderPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
                        },
                        purchases: {
                            count: purchasePayments.length,
                            amount: purchasePayments.reduce((sum, p) => sum + (p.amount || 0), 0)
                        },
                        advances: {
                            count: advancePayments.length,
                            amount: advancePayments.reduce((sum, p) => sum + (p.amount || 0), 0)
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
    }
};
