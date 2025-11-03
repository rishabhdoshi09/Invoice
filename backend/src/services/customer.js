const Dao = require("../dao");

module.exports = {
    createCustomer: async (payload) => {
        try {
            const res = await Dao.customer.createCustomer(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    getCustomer: async (payload) => {
        try {
            const res = await Dao.customer.getCustomer(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    updateCustomer: async (filterObj, updateObj) => {
        try {
            const res = await Dao.customer.updateCustomer(filterObj, updateObj);
            return res;
        } catch (error) {
            throw error;
        }
    },
    listCustomers: async (payload) => {
        try {
            const res = await Dao.customer.listCustomers(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    deleteCustomer: async (payload) => {
        try {
            const res = await Dao.customer.deleteCustomer(payload);
            return res;
        } catch (error) {
            throw error;
        }
    }
};
