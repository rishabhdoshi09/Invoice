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
    // IMPORTANT: Only match by supplierId/partyId to prevent name collision
    getSupplierWithTransactions: async (supplierId) => {
        try {
            const supplier = await db.supplier.findByPk(supplierId);
            if (!supplier) return null;

            // Get all purchases with items (increases balance - what we owe)
            // Sort by createdAt ASC (oldest first for FIFO allocation)
            const purchases = await db.purchaseBill.findAll({
                where: { supplierId },
                attributes: ['id', 'billNumber', 'billDate', 'total', 'paidAmount', 'dueAmount', 'paymentStatus', 'createdAt'],
                include: [{
                    model: db.purchaseItem,
                    as: 'purchaseItems',
                    attributes: ['id', 'name', 'quantity', 'price', 'totalPrice']
                }],
                order: [['createdAt', 'ASC']]  // Oldest first for FIFO
            });

            // Get all payments to this supplier by ID only
            // Sort by createdAt ASC (oldest first for FIFO allocation)
            const payments = await db.payment.findAll({
                where: { 
                    partyId: supplierId,
                    partyType: 'supplier'
                },
                attributes: ['id', 'paymentNumber', 'paymentDate', 'amount', 'referenceType', 'notes', 'createdAt'],
                order: [['createdAt', 'ASC']]  // Oldest first
            });

            // Calculate totals
            const totalPurchases = purchases.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
            const totalPaidOnBills = purchases.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);
            const totalStandalonePayments = payments
                .filter(p => p.referenceType !== 'purchase')
                .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const totalPaid = totalPaidOnBills + totalStandalonePayments;
            
            const totalDebit = totalPurchases + (Number(supplier.openingBalance) || 0);
            const totalCredit = totalPaid;
            
            // Balance = Opening + Purchases - All Payments
            const balance = (Number(supplier.openingBalance) || 0) + totalPurchases - totalPaid;

            // Sort purchases by date DESC for display
            purchases.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            // Sort payments by date DESC for display
            payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            return {
                ...supplier.toJSON(),
                totalDebit,
                totalCredit,
                balance,
                purchases: purchases.map(p => p.toJSON ? p.toJSON() : p),
                payments: payments.map(p => p.toJSON ? p.toJSON() : p)
            };
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },

    // List suppliers with calculated balance
    // Balance = Opening Balance + Sum of all purchase bill dueAmounts (source of truth)
    listSuppliersWithBalance: async (params = {}) => {
        try {
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
                    COALESCE(s."openingBalance", 0) + COALESCE((
                        SELECT SUM(total) 
                        FROM "purchaseBills" 
                        WHERE "supplierId" = s.id
                          AND (COALESCE("isDeleted", false) = false)
                    ), 0) as "totalDebit",
                    COALESCE((
                        SELECT SUM("paidAmount") 
                        FROM "purchaseBills" 
                        WHERE "supplierId" = s.id
                          AND (COALESCE("isDeleted", false) = false)
                    ), 0) + COALESCE((
                        SELECT SUM(amount) 
                        FROM payments 
                        WHERE "partyId" = s.id 
                          AND "partyType" = 'supplier'
                          AND (COALESCE("isDeleted", false) = false)
                          AND "referenceType" != 'purchase'
                    ), 0) as "totalCredit",
                    COALESCE(s."openingBalance", 0) + COALESCE((
                        SELECT SUM(total) 
                        FROM "purchaseBills" 
                        WHERE "supplierId" = s.id
                          AND (COALESCE("isDeleted", false) = false)
                    ), 0) - COALESCE((
                        SELECT SUM("paidAmount") 
                        FROM "purchaseBills" 
                        WHERE "supplierId" = s.id
                          AND (COALESCE("isDeleted", false) = false)
                    ), 0) - COALESCE((
                        SELECT SUM(amount) 
                        FROM payments 
                        WHERE "partyId" = s.id 
                          AND "partyType" = 'supplier'
                          AND (COALESCE("isDeleted", false) = false)
                          AND "referenceType" != 'purchase'
                    ), 0) as balance
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
