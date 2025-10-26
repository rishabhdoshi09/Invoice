
const Dao = require("../dao");

module.exports= {
    addProduct: async (payload) => {
        try {
            const res = await Dao.product.addProduct(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    updateProduct: async (payload) => {
        try {
            const res = await Dao.product.updateProduct(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    listProducts: async (payload) => {
        try {
            const res = await Dao.product.listProducts(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    getProduct: async (payload) => {
        try {
            const res = await Dao.product.getProduct(payload);
            return res;
        } catch (error) {
            throw error;
        }
    },
    deleteProduct: async (payload) => {
        try {
            const res = await Dao.product.deleteProduct(payload);
            return res;
        } catch (error) {
            throw error;
        }
    }
}