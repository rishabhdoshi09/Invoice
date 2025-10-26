const Dao = require("../dao");

module.exports = {
    createPurchaseBill: async (payload) => {
        try {
            const res = await Dao.purchaseBill.createPurchaseBill(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    getPurchaseBill: async (payload) => {
        try {
            const res = await Dao.purchaseBill.getPurchaseBill(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    updatePurchaseBill: async (filterObj, updateObj) => {
        try {
            const res = await Dao.purchaseBill.updatePurchaseBill(filterObj, updateObj);
            return res;
        } catch (error) {
            throw error;
        }
    },
    listPurchaseBills: async (payload) => {
        try {
            const res = await Dao.purchaseBill.listPurchaseBills(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    deletePurchaseBill: async (payload) => {
        try {
            const res = await Dao.purchaseBill.deletePurchaseBill(payload);
            return res;
        } catch (error) {
            throw error;
        }
    }
};
