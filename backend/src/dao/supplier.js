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
            // Sort by createdAt DESC (most recent first - date added)
            const purchases = await db.purchaseBill.findAll({
                where: { supplierId },
                attributes: ['id', 'billNumber', 'billDate', 'total', 'paidAmount', 'dueAmount', 'paymentStatus', 'createdAt'],
                include: [{
                    model: db.purchaseItem,
                    as: 'purchaseItems',
                    attributes: ['id', 'name', 'quantity', 'price', 'totalPrice']
                }],
                order: [['createdAt', 'DESC']]
            });

            // Get all payments to this supplier by ID only
            // Sort by createdAt DESC (most recent first - date added)
            const payments = await db.payment.findAll({
                where: { 
                    partyId: supplierId,
                    partyType: 'supplier'
                },
                attributes: ['id', 'paymentNumber', 'paymentDate', 'amount', 'referenceType', 'notes', 'createdAt'],
                order: [['createdAt', 'DESC']]
            });

            // Calculate totals
            const totalPurchases = purchases.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
            const totalPaidOnBills = purchases.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);
            const totalPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            
            // Balance = Opening + Sum of all due amounts from purchase bills
            // This is the actual amount still owed to the supplier
            const totalDueFromBills = purchases.reduce((sum, p) => sum + (Number(p.dueAmount) || 0), 0);
            const balance = (Number(supplier.openingBalance) || 0) + totalDueFromBills;

            return {
                ...supplier.toJSON(),
                totalDebit: totalPurchases + (Number(supplier.openingBalance) || 0),
                totalCredit: totalPayments,
                totalPurchases,
                totalPaidOnBills,
                totalPayments,
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
    // Balance = Opening + Sum of dueAmount from all purchase bills (actual unpaid amounts)
    listSuppliersWithBalance: async (params = {}) => {
        try {
            // Get all suppliers with dynamically calculated balance
            // Balance is calculated as: openingBalance + sum of dueAmount from all purchase bills
            // This represents the actual amount still owed to each supplier
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
                    ), 0) as balance,
                    COALESCE((
                        SELECT SUM(total) 
                        FROM "purchaseBills" 
                        WHERE "supplierId" = s.id
                    ), 0) as "totalPurchases",
                    COALESCE((
                        SELECT SUM("paidAmount") 
                        FROM "purchaseBills" 
                        WHERE "supplierId" = s.id
                    ), 0) as "totalPaid",
                    COALESCE((
                        SELECT SUM(amount) 
                        FROM payments 
                        WHERE "partyId" = s.id
                        AND "partyType" = 'supplier'
                    ), 0) as "totalPayments"
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
