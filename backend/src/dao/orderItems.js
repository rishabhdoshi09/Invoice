
const db = require('../models');

module.exports = {
    addOrderItems: async (payload) => {
        try {
            const res = await db.orderItems.bulkCreate(payload);
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    }
}