const uuidv4 = require('uuid/v4');
const db = require('../models');

module.exports = {
    createCustomer: async (payload) => {
        try {
            const res = await db.customer.create({ id: uuidv4(), ...payload });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    getCustomer: async (filterObj) => {
        try {
            const res = await db.customer.findOne({ where: filterObj });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    updateCustomer: async (filterObj, updateObj) => {
        try {
            const res = await db.customer.update(updateObj, { where: filterObj });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    deleteCustomer: async (filterObj) => {
        try {
            const res = await db.customer.destroy({ where: filterObj });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    listCustomers: async (filterObj) => {
        try {
            const res = await db.customer.findAndCountAll({ 
                ...( filterObj.q && filterObj.q !== "" ? {
                    where: {
                        [db.Sequelize.Op.or]: [
                            {
                                name: {
                                    [db.Sequelize.Op.iLike]: `%${filterObj.q}%`
                                }
                            },
                            {
                                mobile: {
                                    [db.Sequelize.Op.iLike]: `%${filterObj.q}%`
                                }
                            }
                        ]
                    }}
                : {}),
                order: [['createdAt', 'DESC']], 
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
