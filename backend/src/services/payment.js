const Dao = require("../dao");

module.exports = {
    createPayment: async (payload, transaction = null) => {
        try {
            const res = await Dao.payment.createPayment(payload, transaction);
            return res;
        } catch (error) {
            throw error;
        }
    },
    getPayment: async (payload, transaction = null) => {
        try {
            const res = await Dao.payment.getPayment(payload, transaction);
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
    deletePayment: async (payload, transaction = null) => {
        try {
            const res = await Dao.payment.deletePayment(payload, transaction);
            return res;
        } catch (error) {
            throw error;
        }
    }
};
