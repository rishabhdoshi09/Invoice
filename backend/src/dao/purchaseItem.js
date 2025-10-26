const uuidv4 = require('uuid/v4');
const db = require('../models');

module.exports = {
    addPurchaseItems: async (payload, transaction) => {
        try {
            const items = payload.map(item => ({ id: uuidv4(), ...item }));
            const res = await db.purchaseItem.bulkCreate(items, { transaction });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    deletePurchaseItems: async (filterObj) => {
        try {
            const res = await db.purchaseItem.destroy({ where: filterObj });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    }
};
