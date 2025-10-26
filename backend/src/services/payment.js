const Dao = require("../dao");

module.exports = {
    createPayment: async (payload) => {
        try {
            const res = await Dao.payment.createPayment(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    getPayment: async (payload) => {
        try {
            const res = await Dao.payment.getPayment(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    listPayments: async (payload) => {
        try {
            const res = await Dao.payment.listPayments(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    deletePayment: async (payload) => {
        try {
            const res = await Dao.payment.deletePayment(payload);
            return res;
        } catch (error) {
            throw error;
        }
    }
};
