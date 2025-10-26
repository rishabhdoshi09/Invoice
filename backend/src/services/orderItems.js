
const Dao = require("../dao");

module.exports= {
    addOrderItems: async (payload) => {
        try {
            const res = await Dao.orderItems.addOrderItems(payload);
            return res;
        } catch (error) {
            throw error;
        }
    }
}