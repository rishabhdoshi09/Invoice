const uuidv4 = require('uuid/v4');
const db = require('../models');

module.exports = {
    createOrder: async (payload) => {
        try {
            const res = await db.order.create({ id: uuidv4(), ...payload });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    getOrder: async (filterObj) => {
        try {
            const res = await db.order.findOne({ where: { id: filterObj.id }, include: [ { model: db.orderItems }]});
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
            const res = await db.order.findAndCountAll({ 
                ...( filterObj.q && filterObj.q !== "" ? {
                    where: {
                        orderNumber: {
                            [db.Sequelize.Op.iLike]: `%${filterObj.q}%`
                        }
                    }}
                : {}),
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