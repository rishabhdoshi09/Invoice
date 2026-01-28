const db = require('../models');
const { Op } = require('sequelize');

module.exports = {
    // Get stock by product ID
    getStockByProductId: async (productId) => {
        return await db.stock.findOne({
            where: { productId }
        });
    },

    // Create or update stock
    upsertStock: async (productId, stockData, transaction = null) => {
        const existing = await db.stock.findOne({
            where: { productId },
            transaction
        });

        if (existing) {
            return await existing.update(stockData, { transaction });
        } else {
            return await db.stock.create({
                productId,
                ...stockData
            }, { transaction });
        }
    },

    // List all stocks with product info
    listStocks: async (filters = {}) => {
        const { limit = 100, offset = 0, lowStockOnly = false, q = '' } = filters;

        const whereClause = {};
        
        const productWhere = {};
        if (q && q.trim()) {
            productWhere.name = { [Op.iLike]: `%${q.trim()}%` };
        }

        const stocks = await db.stock.findAndCountAll({
            where: whereClause,
            include: [{
                model: db.product,
                as: 'product',
                where: Object.keys(productWhere).length > 0 ? productWhere : undefined,
                required: true
            }],
            limit,
            offset,
            order: [['lastUpdated', 'DESC']]
        });

        // Filter low stock if needed
        let rows = stocks.rows;
        if (lowStockOnly) {
            rows = rows.filter(s => s.currentStock <= s.minStockLevel);
        }

        return {
            count: lowStockOnly ? rows.length : stocks.count,
            rows
        };
    },

    // Create stock transaction
    createStockTransaction: async (transactionData, transaction = null) => {
        return await db.stockTransaction.create(transactionData, { transaction });
    },

    // List stock transactions
    listStockTransactions: async (filters = {}) => {
        const { productId, limit = 50, offset = 0, startDate, endDate, type } = filters;

        const whereClause = {};
        
        if (productId) {
            whereClause.productId = productId;
        }
        
        if (type) {
            whereClause.type = type;
        }
        
        if (startDate || endDate) {
            whereClause.transactionDate = {};
            if (startDate) {
                whereClause.transactionDate[Op.gte] = startDate;
            }
            if (endDate) {
                whereClause.transactionDate[Op.lte] = endDate;
            }
        }

        return await db.stockTransaction.findAndCountAll({
            where: whereClause,
            include: [{
                model: db.product,
                as: 'product',
                attributes: ['id', 'name', 'type']
            }],
            limit,
            offset,
            order: [['createdAt', 'DESC']]
        });
    },

    // Get stock summary
    getStockSummary: async () => {
        const stocks = await db.stock.findAll({
            include: [{
                model: db.product,
                as: 'product',
                required: true
            }]
        });

        const totalProducts = stocks.length;
        const lowStockCount = stocks.filter(s => s.currentStock <= s.minStockLevel).length;
        const outOfStockCount = stocks.filter(s => s.currentStock <= 0).length;

        return {
            totalProducts,
            lowStockCount,
            outOfStockCount,
            stocks
        };
    }
};
