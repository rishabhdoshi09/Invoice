const Joi = require('joi');

module.exports = {
    validateCreateSupplierObj: (supplierObj) => {
        const schema = Joi.object().keys({
            name: Joi.string().trim().required(),
            mobile: Joi.string().trim().allow("").optional(),
            email: Joi.string().trim().email().allow("").optional(),
            address: Joi.string().trim().allow("").optional(),
            gstin: Joi.string().trim().allow("").optional(),
            openingBalance: Joi.number().optional(),
            currentBalance: Joi.number().optional()
        });
        return Joi.validate(supplierObj, schema);
    },
    
    validateUpdateSupplierObj: (supplierObj) => {
        const schema = Joi.object().keys({
            name: Joi.string().trim().optional(),
            mobile: Joi.string().trim().allow("").optional(),
            email: Joi.string().trim().email().allow("").optional(),
            address: Joi.string().trim().allow("").optional(),
            gstin: Joi.string().trim().allow("").optional(),
            currentBalance: Joi.number().optional()
        });
        return Joi.validate(supplierObj, schema);
    },
    
    validateListSuppliersObj: (supplierObj) => {
        const schema = Joi.object().keys({
            q: Joi.string().trim().allow("").optional(),
            limit: Joi.number().optional(),
            offset: Joi.number().optional()
        });
        return Joi.validate(supplierObj, schema);
    }
};
