const Joi = require('joi');
const Enums = require('../enums');

module.exports = {
    validateCreateOrderObj: (orderObj) => {
        
        // Hard financial limits — any value outside these ranges is a data error
        // or an attempted injection. These limits apply BEFORE server-side math
        // so the recomputed totals are always within safe ranges.
        const MAX_UNIT_PRICE  = 10_000_000;         // ₹1 crore per unit — sanity ceiling
        // Raised from 100_000: real wholesale bills legitimately exceed 1 lakh
        // units per line (bulk low-priced items, weight in small units, or a
        // lump-sum "qty = amount, price = 1" entry). The old cap rejected every
        // bill of ₹1 lakh+ entered that way.
        const MAX_QUANTITY    = 10_000_000;         // 1 crore units per line item
        // Money ceiling used for all amount fields. Kept safely BELOW the
        // DECIMAL(15,2) column limit (~₹10,000 crore) so a valid payload can
        // never overflow the DB on insert. NOT MAX_UNIT_PRICE*MAX_QUANTITY,
        // which (1e7 * 1e7 = 1e14) would exceed DECIMAL(15,2).
        const MAX_MONEY       = 1_000_000_000_000;  // ₹1 lakh crore — above any real invoice
        const MAX_TAX_PERCENT = 100;                // 100 % is the legal maximum
        const MIN_TAX_PERCENT = 0;                  // negative tax is not valid

        const orderItems = Joi.object().keys({
            productId: Joi.string().trim().allow(null, '').optional(),
            name: Joi.string().trim().required(),
            altName: Joi.string().trim().allow('').optional(),
            quantity: Joi.number().greater(0).max(MAX_QUANTITY).required(),
            productPrice: Joi.number().greater(0).max(MAX_UNIT_PRICE).required(),
            totalPrice: Joi.number().greater(0).max(MAX_MONEY).required(),
            type: Joi.string().trim().valid(Object.values(Enums.product)).required(),
            sortOrder: Joi.number().integer().min(0).optional().default(0)
        });

        const schema = Joi.object().keys({
            orderNumber:     Joi.string().trim().optional(), // generated server-side
            orderDate:       Joi.string().trim().required().max(10)
                .regex(/^\d{2}-\d{2}-\d{4}$|^\d{4}-\d{2}-\d{2}$/, 'date format'),
            customerName:    Joi.string().trim().allow('').optional(),
            customerMobile:  Joi.string().trim().allow('').optional(),
            customerAddress: Joi.string().trim().allow('').optional(),
            customerId:      Joi.string().trim().allow('', null).optional(),
            subTotal:        Joi.number().greater(0).max(MAX_MONEY).required(),
            total:           Joi.number().greater(0).max(MAX_MONEY).required(),
            // tax and taxPercent: server recomputes from taxPercent.
            tax:             Joi.number().min(0).max(MAX_MONEY).optional().default(0),
            taxPercent:      Joi.number().min(MIN_TAX_PERCENT).max(MAX_TAX_PERCENT).optional().default(0),
            // HR-GST: Accept GST component splits from the frontend but validate their sum.
            // The server will cross-check: cgst + sgst + igst must equal the computed tax
            // (within 0.01 paisa tolerance). Prevents incorrect GST account postings.
            cgst:            Joi.number().min(0).max(MAX_MONEY).optional().default(0),
            sgst:            Joi.number().min(0).max(MAX_MONEY).optional().default(0),
            igst:            Joi.number().min(0).max(MAX_MONEY).optional().default(0),
            // CGST+SGST and IGST are mutually exclusive (intra-state vs inter-state).
            // Validation: if igst > 0, then cgst and sgst must both be 0 (and vice-versa).
            // This is enforced below in the controller after Joi passes.
            paidAmount:      Joi.number().min(0).max(MAX_MONEY).optional(),
            dueAmount:       Joi.number().min(0).optional(), // always non-negative; advance handled separately
            paymentStatus:   Joi.string().trim().valid('paid', 'partial', 'unpaid').optional(),
            notes:           Joi.string().trim().allow('').optional(),
            paymentMode:     Joi.string().trim().valid('CASH', 'CREDIT').optional(),
            // Grey/White split of `total` — only meaningful for CREDIT orders.
            // Sum is cross-checked against `total` in the controller (Joi can't see sibling-of-sibling sums cleanly here).
            greyAmount:      Joi.number().min(0).max(MAX_MONEY).optional().default(0),
            whiteAmount:     Joi.number().min(0).max(MAX_MONEY).optional().default(0),
            // Manually-controlled deduction from the customer's existing advance/on-account
            // credit balance. Requires customerId — validated & applied in the controller.
            advanceToApply:  Joi.number().min(0).max(MAX_MONEY).optional().default(0),
            idempotencyKey:  Joi.string().trim().max(128).allow('', null).optional(),
            orderItems:      Joi.array().items(orderItems).min(1).required()
        });
        return Joi.validate(orderObj, schema, { convert: true, allowUnknown: true });
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
