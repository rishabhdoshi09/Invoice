const Dao = require("../dao");

module.exports = {
    addPurchaseItems: async (payload, transaction) => {
        try {
            const res = await Dao.purchaseItem.addPurchaseItems(payload, transaction);
            return res;
        } catch (error) {
            throw error;
        }
    },
    deletePurchaseItems: async (payload) => {
        try {
            const res = await Dao.purchaseItem.deletePurchaseItems(payload);
            return res;
        } catch (error) {
            throw error;
        }
    }
};
