
const Dao = require("../dao");

module.exports= {
    addOrderItems: async (payload, transaction = null) => {
        try {
            const res = await Dao.orderItems.addOrderItems(payload, transaction);
            return res;
        } catch (error) {
            throw error;
        }
    }
}