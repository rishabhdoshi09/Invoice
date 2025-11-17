const uuidv4 = require('uuid/v4');
const db = require('../models');

module.exports = {
    createPayment: async (payload, transaction = null) => {
        try {
            const options = {};
            if (transaction) {
                options.transaction = transaction;
            }
            const res = await db.payment.create({ id: uuidv4(), ...payload }, options);
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    getPayment: async (filterObj, transaction = null) => {
        try {
            const options = { where: filterObj };
            if (transaction) {
                options.transaction = transaction;
            }
            const res = await db.payment.findOne(options);
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    listPayments: async (filterObj) => {
        try {
            const whereClause = {};
            
            if (filterObj.q && filterObj.q !== "") {
                whereClause[db.Sequelize.Op.or] = [
                    {
                        paymentNumber: {
                            [db.Sequelize.Op.iLike]: `%${filterObj.q}%`
                        }
                    },
                    {
                        partyName: {
                            [db.Sequelize.Op.iLike]: `%${filterObj.q}%`
                        }
                    }
                ];
            }
            
            if (filterObj.partyId) {
                whereClause.partyId = filterObj.partyId;
            }
            
            if (filterObj.partyType) {
                whereClause.partyType = filterObj.partyType;
            }

            const res = await db.payment.findAndCountAll({ 
                where: whereClause,
                order: [['createdAt', 'DESC']], 
                limit: filterObj.limit ?? 25,
                offset: filterObj.offset ?? 0
            });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    deletePayment: async (filterObj, transaction = null) => {
        try {
            const options = { where: filterObj };
            if (transaction) {
                options.transaction = transaction;
            }
            const res = await db.payment.destroy(options);
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    }
};
