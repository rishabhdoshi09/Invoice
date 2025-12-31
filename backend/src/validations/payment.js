const Joi = require('joi');

module.exports = {
    validateCreatePaymentObj: (paymentObj) => {
        const schema = Joi.object().keys({
            paymentNumber: Joi.string().trim().required(),
            paymentDate: Joi.string().trim().required(),
            partyId: Joi.string().trim().allow("", null).optional(),
            partyName: Joi.string().trim().required(),
            partyType: Joi.string().trim().valid('customer', 'supplier', 'expense').required(),
            amount: Joi.number().greater(0).required(),
            referenceType: Joi.string().trim().valid('order', 'purchase', 'advance').required(),
            referenceId: Joi.string().trim().allow("").optional(),
            referenceNumber: Joi.string().trim().allow("").optional(),
            notes: Joi.string().trim().allow("").optional()
        });
        return Joi.validate(paymentObj, schema);
    },
    
    validateListPaymentsObj: (paymentObj) => {
        const schema = Joi.object().keys({
            q: Joi.string().trim().allow("").optional(),
            partyId: Joi.string().trim().allow("").optional(),
            partyType: Joi.string().trim().valid('customer', 'supplier', 'expense').allow("").optional(),
            startDate: Joi.string().trim().allow("").optional(),
            endDate: Joi.string().trim().allow("").optional(),
            date: Joi.string().trim().allow("").optional(),
            limit: Joi.number().optional(),
            offset: Joi.number().optional()
        });
        return Joi.validate(paymentObj, schema, { convert: true });
    }
};
