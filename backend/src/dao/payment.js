const uuidv4 = require('uuid/v4');
const db = require('../models');

module.exports = {
    createPayment: async (payload) => {
        try {
            const res = await db.payment.create({ id: uuidv4(), ...payload });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    getPayment: async (filterObj) => {
        try {
            const res = await db.payment.findOne({ where: filterObj });
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

            // Date filtering - for daily payments
            // Handle both YYYY-MM-DD and DD-MM-YYYY formats
            if (filterObj.date) {
                // If date is in YYYY-MM-DD format, convert to DD-MM-YYYY
                let dateStr = filterObj.date;
                if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    const [year, month, day] = dateStr.split('-');
                    dateStr = `${day}-${month}-${year}`;
                }
                whereClause.paymentDate = dateStr;
            } else if (filterObj.startDate && filterObj.endDate) {
                whereClause.paymentDate = {
                    [db.Sequelize.Op.between]: [filterObj.startDate, filterObj.endDate]
                };
            } else if (filterObj.startDate) {
                whereClause.paymentDate = {
                    [db.Sequelize.Op.gte]: filterObj.startDate
                };
            } else if (filterObj.endDate) {
                whereClause.paymentDate = {
                    [db.Sequelize.Op.lte]: filterObj.endDate
                };
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
    deletePayment: async (filterObj) => {
        try {
            const res = await db.payment.destroy({ where: filterObj });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    }
};
