const uuidv4 = require('uuid/v4');
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
                where: { id: filterObj.id },
                include: [ { model: db.orderItems }]
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
    deleteOrder: async (filterObj) => {
        try {
            const res = await db.order.destroy({ where: { id: filterObj.id }});
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
            
            // Add search filter if provided
            if (filterObj.q && filterObj.q !== "") {
                whereClause.orderNumber = {
                    [db.Sequelize.Op.iLike]: `%${filterObj.q}%`
                };
            }
            
            // Add date filter if provided
            if (filterObj.date) {
                whereClause.orderDate = filterObj.date;
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
                order: [['createdAt', 'DESC']], 
                include: [ { model: db.orderItems }], 
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
    updateOrder: async (filterObj, updateObj) => {
        try {
            const res = await db.order.update(updateObj, { where: filterObj });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    }
}