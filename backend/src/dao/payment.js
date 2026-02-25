const uuidv4 = require('uuid/v4');
const db = require('../models');

module.exports = {
    createPayment: async (payload) => {
        try {
            // NORMALIZE DATE FORMAT: Always store as DD-MM-YYYY
            if (payload.paymentDate) {
                const moment = require('moment-timezone');
                // Try parsing with multiple formats
                const parsedDate = moment(payload.paymentDate, ['YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY'], true);
                if (parsedDate.isValid()) {
                    payload.paymentDate = parsedDate.format('DD-MM-YYYY');
                }
            }
            
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
            const whereClause = { isDeleted: false };
            
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
            // Handle multiple date formats consistently
            if (filterObj.date) {
                const moment = require('moment-timezone');
                // Parse the input date with multiple formats
                const parsedDate = moment(filterObj.date, ['YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY'], true);
                if (parsedDate.isValid()) {
                    // Query with multiple possible stored formats
                    const ddmmyyyy = parsedDate.format('DD-MM-YYYY');
                    const yyyymmdd = parsedDate.format('YYYY-MM-DD');
                    const ddmmyyyySlash = parsedDate.format('DD/MM/YYYY');
                    
                    whereClause.paymentDate = {
                        [db.Sequelize.Op.or]: [ddmmyyyy, yyyymmdd, ddmmyyyySlash]
                    };
                } else {
                    // Fallback to exact match
                    whereClause.paymentDate = filterObj.date;
                }
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
