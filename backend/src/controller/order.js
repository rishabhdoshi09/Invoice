
const uuidv4 = require('uuid/v4');
const Services = require('../services');
const Validations = require('../validations');
const db = require('../models');

module.exports = {
    createOrder: async (req, res) => {
        try {
            const { error, value } = Validations.order.validateCreateOrderObj({ ...req.body, orderNumber: `ORD-${uuidv4().split('-')[0].toUpperCase()}` });
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            let { orderItems, ...orderObj } = value;

            // Calculate payment status (most sales are cash, default to paid)
            if (!orderObj.paidAmount) orderObj.paidAmount = orderObj.total; // Default: fully paid
            orderObj.dueAmount = orderObj.total - orderObj.paidAmount;
            
            if (orderObj.paidAmount === 0) {
                orderObj.paymentStatus = 'unpaid';
            } else if (orderObj.paidAmount >= orderObj.total) {
                orderObj.paymentStatus = 'paid';
            } else {
                orderObj.paymentStatus = 'partial';
            }

            const result = await db.sequelize.transaction(async (transaction) => {
                
                const response = await Services.order.createOrder(orderObj, transaction);
                const orderId = response.id;

                orderItems = orderItems.map(item => { return {...item, orderId: orderId } });
                await Services.orderItems.addOrderItems(orderItems, transaction);

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
                if (orderObj.dueAmount > 0) {
                    // Assuming customer has a ledgerId
                    const customer = await Services.customer.getCustomer({ id: orderObj.customerId });
                    if (customer) {
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

                return await Services.order.getOrder({id: orderId });
            });

            return res.status(200).send({
                status: 200,
                message: 'order created successfully',
                data: result
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error
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
        try{
            const orderId = req.params.orderId;
            const { orderItems, ...orderData } = req.body;
            
            // Update order in transaction
            const result = await db.sequelize.transaction(async (transaction) => {
                // Update order basic info
                await Services.order.updateOrder(
                    { id: orderId },
                    orderData
                );
                
                // Update order items if provided
                if (orderItems && orderItems.length > 0) {
                    // Delete existing items
                    await db.orderItems.destroy({
                        where: { orderId: orderId },
                        transaction
                    });
                    
                    // Create updated items
                    const items = orderItems.map(item => ({
                        ...item,
                        orderId: orderId
                    }));
                    await Services.orderItems.addOrderItems(items, transaction);
                }
                
                // Return updated order with items
                return await Services.order.getOrder({ id: orderId });
            });
            
            return res.status(200).send({
                status: 200,
                message: 'order updated successfully',
                data: result
            });
            
        }catch(error){
            console.error('Update order error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            })            
        }
    },
    deleteOrder: async(req, res) => {
        try{
            const response = await Services.order.deleteOrder({ id: req.params.orderId });
            
            if(response){
                return res.status(200).send({
                    status:200,
                    message: 'order deleted successfully',
                    data: response
                })
            }

            return res.status(400).send({
                status:400,
                message: "order doesn't exist"
            })
            
        }catch(error){
            return res.status(500).send({
                status:500,
                message: error
            })            
        }
    },
}