const { v4: uuidv4 } = require('uuid');
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
                where: { ...filterObj, isDeleted: false },
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
            // Soft delete — never hard-delete financial records (preserves audit trail)
            const res = await db.purchaseBill.update(
                { isDeleted: true, deletedAt: new Date() },
                { where: filterObj }
            );
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    listPurchaseBills: async (filterObj) => {
        try {
            const whereClause = { isDeleted: false };
            if (filterObj.q && filterObj.q !== '') {
                whereClause.billNumber = { [db.Sequelize.Op.iLike]: `%${filterObj.q}%` };
            }
            const res = await db.purchaseBill.findAndCountAll({
                where: whereClause,
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
