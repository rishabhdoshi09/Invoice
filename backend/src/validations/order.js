const Joi = require('joi');
const Enums = require('../enums');

module.exports = {
    validateCreateOrderObj: (orderObj) => {
        
        const orderItems = Joi.object().keys({
            productId: Joi.string().trim().required(),
            name: Joi.string().trim().required(),
            altName: Joi.string().trim().allow("").optional(),
            quantity: Joi.number().greater(0).required(),
            productPrice: Joi.number().greater(0).required(),
            totalPrice: Joi.number().greater(0).required(),
            type: Joi.string().trim().valid(Object.values(Enums.product)).required()
        });
        
        const schema = Joi.object().keys({
            orderNumber: Joi.string().trim().optional(), // Now optional - generated server-side
            orderDate: Joi.string().trim().required(),
            customerName: Joi.string().trim().allow("").optional(),
            customerMobile: Joi.string().trim().allow("").optional(),
            subTotal: Joi.number().greater(0).required(),
            total: Joi.number().greater(0).required(),
            tax: Joi.number().greater(-1).required(),
            taxPercent: Joi.number().greater(-1).required(),
            paidAmount: Joi.number().greater(-1).optional(),
            dueAmount: Joi.number().greater(-1).optional(),
            paymentStatus: Joi.string().trim().valid('paid', 'partial', 'unpaid').optional(),
            orderItems: Joi.array().items(orderItems).required()
        });
        return Joi.validate(orderObj, schema, { convert: true });
    },
    
    validateListOrdersObj: (orderObj) => {
        const schema = Joi.object().keys({
            q: Joi.string().trim().allow("").optional(),
            date: Joi.string().trim().allow("").optional(),
            startDate: Joi.string().trim().allow("").optional(),
            endDate: Joi.string().trim().allow("").optional(),
            limit: Joi.number().optional(),
            offset: Joi.number().optional()
        });
        return Joi.validate(orderObj, schema, { convert: true });
    },
};
