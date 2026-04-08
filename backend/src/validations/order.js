const Joi = require('joi');
const Enums = require('../enums');

module.exports = {
    validateCreateOrderObj: (orderObj) => {
        
        // Hard financial limits — any value outside these ranges is a data error
        // or an attempted injection. These limits apply BEFORE server-side math
        // so the recomputed totals are always within safe ranges.
        const MAX_UNIT_PRICE  = 10_000_000; // ₹1 crore per item — sanity ceiling
        const MAX_QUANTITY    = 100_000;    // 1 lakh units per line item
        const MAX_TAX_PERCENT = 100;        // 100 % is the legal maximum
        const MIN_TAX_PERCENT = 0;          // negative tax is not valid

        const orderItems = Joi.object().keys({
            productId: Joi.string().trim().allow(null, '').optional(),
            name: Joi.string().trim().required(),
            altName: Joi.string().trim().allow('').optional(),
            quantity: Joi.number().greater(0).max(MAX_QUANTITY).required(),
            productPrice: Joi.number().greater(0).max(MAX_UNIT_PRICE).required(),
            totalPrice: Joi.number().greater(0).max(MAX_UNIT_PRICE * MAX_QUANTITY).required(),
            type: Joi.string().trim().valid(Object.values(Enums.product)).required(),
            sortOrder: Joi.number().integer().min(0).optional().default(0)
        });

        const schema = Joi.object().keys({
            orderNumber: Joi.string().trim().optional(), // generated server-side
            orderDate: Joi.string().trim().required().max(10)
                .regex(/^\d{2}-\d{2}-\d{4}$|^\d{4}-\d{2}-\d{2}$/, 'date format'),
            customerName: Joi.string().trim().allow('').optional(),
            customerMobile: Joi.string().trim().allow('').optional(),
            customerAddress: Joi.string().trim().allow('').optional(),
            customerId: Joi.string().trim().allow('', null).optional(),
            subTotal: Joi.number().greater(0).max(MAX_UNIT_PRICE * MAX_QUANTITY).required(),
            total: Joi.number().greater(0).max(MAX_UNIT_PRICE * MAX_QUANTITY).required(),
            // tax and taxPercent: server recomputes from taxPercent, these are hints
            tax: Joi.number().min(0).max(MAX_UNIT_PRICE * MAX_QUANTITY).optional().default(0),
            taxPercent: Joi.number().min(MIN_TAX_PERCENT).max(MAX_TAX_PERCENT).optional().default(0),
            paidAmount: Joi.number().min(0).max(MAX_UNIT_PRICE * MAX_QUANTITY).optional(),
            dueAmount: Joi.number().optional(), // can be negative (overpayment)
            paymentStatus: Joi.string().trim().valid('paid', 'partial', 'unpaid').optional(),
            notes: Joi.string().trim().allow('').optional(),
            paymentMode: Joi.string().trim().valid('CASH', 'CREDIT').optional(),
            idempotencyKey: Joi.string().trim().max(128).allow('', null).optional(),
            orderItems: Joi.array().items(orderItems).min(1).required()
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
            offset: Joi.number().optional(),
            _t: Joi.number().optional() // Cache-busting timestamp
        });
        return Joi.validate(orderObj, schema, { convert: true });
    },
};
