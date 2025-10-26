const uuidv4 = require('uuid/v4');
const Services = require('../services');
const Validations = require('../validations');
const db = require('../models');

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

                // Update reference (order or purchase) payment status
                if (value.referenceType === 'order' && value.referenceId) {
                    const order = await Services.order.getOrder({ id: value.referenceId });
                    if (order) {
                        const newPaidAmount = (order.paidAmount || 0) + value.amount;
                        const newDueAmount = order.total - newPaidAmount;
                        let paymentStatus = 'unpaid';
                        
                        if (newPaidAmount >= order.total) {
                            paymentStatus = 'paid';
                        } else if (newPaidAmount > 0) {
                            paymentStatus = 'partial';
                        }

                        await Services.order.updateOrder(
                            { id: value.referenceId },
                            { 
                                paidAmount: newPaidAmount, 
                                dueAmount: newDueAmount,
                                paymentStatus: paymentStatus
                            }
                        );
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

            // Reverse the payment updates
            if (payment.referenceType === 'order' && payment.referenceId) {
                const order = await Services.order.getOrder({ id: payment.referenceId });
                if (order) {
                    const newPaidAmount = (order.paidAmount || 0) - payment.amount;
                    const newDueAmount = order.total - newPaidAmount;
                    let paymentStatus = 'unpaid';
                    
                    if (newPaidAmount >= order.total) {
                        paymentStatus = 'paid';
                    } else if (newPaidAmount > 0) {
                        paymentStatus = 'partial';
                    }

                    await Services.order.updateOrder(
                        { id: payment.referenceId },
                        { 
                            paidAmount: newPaidAmount, 
                            dueAmount: newDueAmount,
                            paymentStatus: paymentStatus
                        }
                    );
                }
            } else if (payment.referenceType === 'purchase' && payment.referenceId) {
                const purchase = await Services.purchaseBill.getPurchaseBill({ id: payment.referenceId });
                if (purchase) {
                    const newPaidAmount = (purchase.paidAmount || 0) - payment.amount;
                    const newDueAmount = purchase.total - newPaidAmount;
                    let paymentStatus = 'unpaid';
                    
                    if (newPaidAmount >= purchase.total) {
                        paymentStatus = 'paid';
                    } else if (newPaidAmount > 0) {
                        paymentStatus = 'partial';
                    }

                    await Services.purchaseBill.updatePurchaseBill(
                        { id: payment.referenceId },
                        { 
                            paidAmount: newPaidAmount, 
                            dueAmount: newDueAmount,
                            paymentStatus: paymentStatus
                        }
                    );

                    // Update supplier balance
                    const supplier = await Services.supplier.getSupplier({ id: purchase.supplierId });
                    if (supplier) {
                        const newBalance = (supplier.currentBalance || 0) + payment.amount;
                        await Services.supplier.updateSupplier(
                            { id: purchase.supplierId },
                            { currentBalance: newBalance }
                        );
                    }
                }
            }

            const response = await Services.payment.deletePayment({ id: req.params.paymentId });
            
            if (response) {
                return res.status(200).send({
                    status: 200,
                    message: 'payment deleted successfully',
                    data: response
                });
            }
            
        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });            
        }
    }
};
