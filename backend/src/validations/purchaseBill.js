const Joi = require('joi');
const Enums = require('../enums');

module.exports = {
    validateCreatePurchaseBillObj: (purchaseObj) => {
        
        const purchaseItems = Joi.object().keys({
            name: Joi.string().trim().required(),
            quantity: Joi.number().greater(0).required(),
            price: Joi.number().greater(0).required(),
            totalPrice: Joi.number().greater(0).required(),
            type: Joi.string().trim().valid(Object.values(Enums.product)).optional()
        });
        
        const schema = Joi.object().keys({
            billNumber: Joi.string().trim().allow('').optional(),
            billDate: Joi.string().trim().required(),
            supplierId: Joi.string().trim().required(),
            subTotal: Joi.number().greater(0).required(),
            total: Joi.number().greater(0).required(),
            tax: Joi.number().greater(-1).required(),
            taxPercent: Joi.number().greater(-1).required(),
            paidAmount: Joi.number().greater(-1).optional(),
            dueAmount: Joi.number().greater(-1).optional(),
            paymentStatus: Joi.string().trim().valid('paid', 'partial', 'unpaid').optional(),
            purchaseItems: Joi.array().items(purchaseItems).required()
        });
        return Joi.validate(purchaseObj, schema);
    },
    
    validateListPurchaseBillsObj: (purchaseObj) => {
        const schema = Joi.object().keys({
            q: Joi.string().trim().allow("").optional(),
            limit: Joi.number().optional(),
            offset: Joi.number().optional()
        });
        return Joi.validate(purchaseObj, schema);
    }
};
