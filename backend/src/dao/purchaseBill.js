const uuidv4 = require('uuid/v4');
const db = require('../models');

module.exports = {
    createPurchaseBill: async (payload) => {
        try {
            const res = await db.purchaseBill.create({ id: uuidv4(), ...payload });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    getPurchaseBill: async (filterObj) => {
        try {
            const res = await db.purchaseBill.findOne({ 
                where: filterObj,
                include: [
                    { model: db.purchaseItem },
                    { model: db.supplier }
                ]
            });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    updatePurchaseBill: async (filterObj, updateObj) => {
        try {
            const res = await db.purchaseBill.update(updateObj, { where: filterObj });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    deletePurchaseBill: async (filterObj) => {
        try {
            const res = await db.purchaseBill.destroy({ where: filterObj });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    listPurchaseBills: async (filterObj) => {
        try {
            const res = await db.purchaseBill.findAndCountAll({ 
                ...( filterObj.q && filterObj.q !== "" ? {
                    where: {
                        billNumber: {
                            [db.Sequelize.Op.iLike]: `%${filterObj.q}%`
                        }
                    }}
                : {}),
                order: [['createdAt', 'DESC']], 
                include: [
                    { model: db.purchaseItem },
                    { model: db.supplier }
                ], 
                distinct: true,
                limit: filterObj.limit ?? 25,
                offset: filterObj.offset ?? 0
            });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    }
};
