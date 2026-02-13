const uuidv4 = require('uuid/v4');
const db = require('../models');

module.exports = {
    createSupplier: async (payload) => {
        try {
            const res = await db.supplier.create({ id: uuidv4(), ...payload });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    getSupplier: async (filterObj) => {
        try {
            const res = await db.supplier.findOne({ where: filterObj });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    updateSupplier: async (filterObj, updateObj) => {
        try {
            const res = await db.supplier.update(updateObj, { where: filterObj });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },
    deleteSupplier: async (filterObj) => {
        try {
            const res = await db.supplier.destroy({ where: filterObj });
            return res;
        } catch (error) {
            console.log(error);
            throw error;  // Throw the original error, not wrapped
        }
    },
    listSuppliers: async (filterObj) => {
        try {
            const res = await db.supplier.findAndCountAll({ 
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
                limit: filterObj.limit ?? 100,
                offset: filterObj.offset ?? 0
            });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },

    // Get supplier with debit/credit details
    getSupplierWithTransactions: async (supplierId) => {
        try {
            const supplier = await db.supplier.findByPk(supplierId);
            if (!supplier) return null;

            // Get all purchases (increases balance - what we owe)
            // Sort by createdAt DESC (most recent first - date added)
            const purchases = await db.purchaseBill.findAll({
                where: { supplierId },
                attributes: ['id', 'billNumber', 'billDate', 'total', 'paidAmount', 'dueAmount', 'paymentStatus', 'createdAt'],
                order: [['createdAt', 'DESC']]
            });

            // Get all payments to this supplier - check both partyId and partyName for backwards compatibility
            // Sort by createdAt DESC (most recent first - date added)
            const payments = await db.payment.findAll({
                where: { 
                    [db.Sequelize.Op.or]: [
                        { partyId: supplierId },
                        { 
                            partyName: supplier.name,
                            partyType: 'supplier'
                        }
                    ]
                },
                attributes: ['id', 'paymentNumber', 'paymentDate', 'amount', 'referenceType', 'notes', 'createdAt'],
                order: [['createdAt', 'DESC']]
            });

            // Calculate totals
            const totalDebit = purchases.reduce((sum, p) => sum + (Number(p.total) || 0), 0) + (Number(supplier.openingBalance) || 0);
            const totalCredit = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const balance = totalDebit - totalCredit;

            return {
                ...supplier.toJSON(),
                totalDebit,
                totalCredit,
                balance,
                purchases,
                payments
            };
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },

    // List suppliers with calculated balance (NOT stored balance)
    // This ensures balance is always accurate from actual transactions
    listSuppliersWithBalance: async (params = {}) => {
        try {
            // Get all suppliers with dynamically calculated balance
            const suppliers = await db.sequelize.query(`
                SELECT 
                    s.id,
                    s.name,
                    s.mobile,
                    s.email,
                    s.address,
                    s.gstin,
                    s."openingBalance",
                    s."createdAt",
                    s."updatedAt",
                    COALESCE(s."openingBalance", 0) + 
                    COALESCE((
                        SELECT SUM("dueAmount") 
                        FROM "purchaseBills" 
                        WHERE "supplierId" = s.id 
                        AND "paymentStatus" != 'paid'
                    ), 0) -
                    COALESCE((
                        SELECT SUM(amount) 
                        FROM payments 
                        WHERE ("partyId" = s.id OR "partyName" = s.name) 
                        AND "partyType" = 'supplier'
                    ), 0) as balance,
                    COALESCE((
                        SELECT SUM(total) 
                        FROM "purchaseBills" 
                        WHERE "supplierId" = s.id
                    ), 0) as "totalDebit",
                    COALESCE((
                        SELECT SUM(amount) 
                        FROM payments 
                        WHERE ("partyId" = s.id OR "partyName" = s.name) 
                        AND "partyType" = 'supplier'
                    ), 0) as "totalCredit"
                FROM suppliers s
                ORDER BY s.name ASC
            `, { type: db.Sequelize.QueryTypes.SELECT });

            return {
                count: suppliers.length,
                rows: suppliers
            };
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    }
};
