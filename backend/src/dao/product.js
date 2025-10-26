const uuidv4 = require('uuid/v4');
const db = require('../models');

module.exports = {
    addProduct: async (payload) => {
        try {
            const res = await db.product.create({ id: uuidv4(), ...payload });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    updateProduct: async (payload) => {
        try {
            const res = await db.product.update(payload, { where: { id: payload.id }, returning: true });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    getProduct: async (filterObj) => {
        try {
            const res = await db.product.findOne({ where: { id: filterObj.id }});
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    deleteProduct: async (filterObj) => {
        try {
            const res = await db.product.destroy({ where: { id: filterObj.id }});
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    listProducts: async (filterObj) => {
        try {
            const res = await db.product.findAndCountAll({ where: filterObj, order: [['createdAt', 'DESC']]});
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    }
}