
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