const Joi = require('joi');

module.exports = {
    validateStockTransaction: (data) => {
        const schema = Joi.object().keys({
            productId: Joi.string().uuid().required(),
            type: Joi.string().valid('in', 'out', 'adjustment').required(),
            quantity: Joi.number().greater(0).required(),
            notes: Joi.string().allow('').optional(),
            transactionDate: Joi.string().optional()
        });
        return Joi.validate(data, schema, { convert: true });
    },

    validateStockAdjustment: (data) => {
        const schema = Joi.object().keys({
            productId: Joi.string().uuid().required(),
            newStock: Joi.number().min(0).required(),
            notes: Joi.string().allow('').optional()
        });
        return Joi.validate(data, schema, { convert: true });
    },

    validateInitializeStock: (data) => {
        const schema = Joi.object().keys({
            productId: Joi.string().uuid().required(),
            initialStock: Joi.number().min(0).optional().default(0),
            minStockLevel: Joi.number().min(0).optional().default(0),
            unit: Joi.string().optional().default('kg')
        });
        return Joi.validate(data, schema, { convert: true });
    },

    validateListStocks: (data) => {
        const schema = Joi.object().keys({
            limit: Joi.number().optional(),
            offset: Joi.number().optional(),
            lowStockOnly: Joi.boolean().optional(),
            q: Joi.string().allow('').optional()
        });
        return Joi.validate(data, schema, { convert: true });
    },

    validateListTransactions: (data) => {
        const schema = Joi.object().keys({
            productId: Joi.string().uuid().optional(),
            limit: Joi.number().optional(),
            offset: Joi.number().optional(),
            startDate: Joi.string().optional(),
            endDate: Joi.string().optional(),
            type: Joi.string().valid('in', 'out', 'adjustment').optional()
        });
        return Joi.validate(data, schema, { convert: true });
    }
};
