const Dao = require("../dao");

module.exports = {
    createSupplier: async (payload) => {
        try {
            const res = await Dao.supplier.createSupplier(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    getSupplier: async (payload) => {
        try {
            const res = await Dao.supplier.getSupplier(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    updateSupplier: async (filterObj, updateObj) => {
        try {
            const res = await Dao.supplier.updateSupplier(filterObj, updateObj);
            return res;
        } catch (error) {
            throw error;
        }
    },
    listSuppliers: async (payload) => {
        try {
            const res = await Dao.supplier.listSuppliers(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    deleteSupplier: async (payload) => {
        try {
            const res = await Dao.supplier.deleteSupplier(payload);
            return res;
        } catch (error) {
            throw error;
        }
    }
};
