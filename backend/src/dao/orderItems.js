
const db = require('../models');

module.exports = {
    addOrderItems: async (payload, transaction = null) => {
        try {
            const options = transaction ? { transaction } : {};
            const res = await db.orderItems.bulkCreate(payload, options);
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    }
}