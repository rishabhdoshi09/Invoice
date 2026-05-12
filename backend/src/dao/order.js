const { v4: uuidv4 } = require('uuid');
const db = require('../models');

module.exports = {
    createOrder: async (payload, transaction = null) => {
        try {
            const options = transaction ? { transaction } : {};
            const res = await db.order.create({ id: uuidv4(), ...payload }, options);
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    getOrder: async (filterObj, transaction = null) => {
        try {
            const options = {
                where: { id: filterObj.id, isDeleted: false },
                include: [ {
                    model: db.orderItems,
                    separate: true,
                    order: [['sortOrder', 'ASC']]
                }]
            };
            if (transaction) {
                options.transaction = transaction;
            }
            const res = await db.order.findOne(options);
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    deleteOrder: async (filterObj, transaction = null) => {
        try {
            const options = { where: { id: filterObj.id } };
            if (transaction) options.transaction = transaction;
            // Soft delete — preserves the record for audit/ledger reversal
            const res = await db.order.update(
                { isDeleted: true, deletedAt: new Date() },
                options
            );
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    listOrders: async (filterObj) => {
        try {
            const whereClause = {
                isDeleted: false  // Always filter out deleted orders
            };
            
            // Add search filter if provided - search across orderNumber, customerName, and customerMobile
            if (filterObj.q && filterObj.q !== "") {
                whereClause[db.Sequelize.Op.or] = [
                    { orderNumber: { [db.Sequelize.Op.iLike]: `%${filterObj.q}%` } },
                    { customerName: { [db.Sequelize.Op.iLike]: `%${filterObj.q}%` } },
                    { customerMobile: { [db.Sequelize.Op.iLike]: `%${filterObj.q}%` } }
                ];
            }
            
            // Add date filter if provided - handle multiple formats
            if (filterObj.date) {
                const moment = require('moment-timezone');
                const parsedDate = moment(filterObj.date, ['YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY'], true);
                if (parsedDate.isValid()) {
                    // Query with multiple possible stored formats
                    const ddmmyyyy = parsedDate.format('DD-MM-YYYY');
                    const yyyymmdd = parsedDate.format('YYYY-MM-DD');
                    
                    whereClause.orderDate = {
                        [db.Sequelize.Op.or]: [ddmmyyyy, yyyymmdd]
                    };
                } else {
                    whereClause.orderDate = filterObj.date;
                }
            }
            
            // Add date range filter if provided
            if (filterObj.startDate && filterObj.endDate) {
                whereClause.orderDate = {
                    [db.Sequelize.Op.between]: [filterObj.startDate, filterObj.endDate]
                };
            } else if (filterObj.startDate) {
                whereClause.orderDate = {
                    [db.Sequelize.Op.gte]: filterObj.startDate
                };
            } else if (filterObj.endDate) {
                whereClause.orderDate = {
                    [db.Sequelize.Op.lte]: filterObj.endDate
                };
            }
            
            const res = await db.order.findAndCountAll({ 
                where: whereClause,
                order: [[db.Sequelize.literal("SPLIT_PART(\"orderDate\", '-', 3) || SPLIT_PART(\"orderDate\", '-', 2) || SPLIT_PART(\"orderDate\", '-', 1)"), 'DESC'], ['createdAt', 'DESC']],
                include: [ { 
                    model: db.orderItems,
                    separate: true,
                    order: [['sortOrder', 'ASC']]
                }], 
                distinct: true,
                limit: filterObj.limit ?? 25,
                offset: filterObj.offset ?? 0
            });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    updateOrder: async (filterObj, updateObj, transaction = null) => {
        try {
            const options = { where: filterObj };
            if (transaction) options.transaction = transaction;
            const res = await db.order.update(updateObj, options);
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    }
}