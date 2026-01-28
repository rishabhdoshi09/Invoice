const DAO = require('../dao');
const db = require('../models');

module.exports = {
    // Get stock by product ID
    getStockByProductId: async (productId) => {
        return await DAO.stock.getStockByProductId(productId);
    },

    // List all stocks
    listStocks: async (filters) => {
        return await DAO.stock.listStocks(filters);
    },

    // Get stock summary
    getStockSummary: async () => {
        return await DAO.stock.getStockSummary();
    },

    // Add stock (Stock In)
    addStock: async (productId, quantity, transactionData, transaction = null) => {
        const stock = await DAO.stock.getStockByProductId(productId);
        const previousStock = stock?.currentStock || 0;
        const newStock = previousStock + quantity;

        // Update stock
        await DAO.stock.upsertStock(productId, {
            currentStock: newStock,
            lastUpdated: new Date()
        }, transaction);

        // Create transaction record
        await DAO.stock.createStockTransaction({
            productId,
            type: 'in',
            quantity,
            previousStock,
            newStock,
            ...transactionData
        }, transaction);

        return { previousStock, newStock, quantity };
    },

    // Remove stock (Stock Out)
    removeStock: async (productId, quantity, transactionData, transaction = null) => {
        const stock = await DAO.stock.getStockByProductId(productId);
        const previousStock = stock?.currentStock || 0;
        const newStock = Math.max(0, previousStock - quantity);

        // Update stock
        await DAO.stock.upsertStock(productId, {
            currentStock: newStock,
            lastUpdated: new Date()
        }, transaction);

        // Create transaction record
        await DAO.stock.createStockTransaction({
            productId,
            type: 'out',
            quantity,
            previousStock,
            newStock,
            ...transactionData
        }, transaction);

        return { previousStock, newStock, quantity };
    },

    // Adjust stock (manual adjustment)
    adjustStock: async (productId, newStockValue, transactionData, transaction = null) => {
        const stock = await DAO.stock.getStockByProductId(productId);
        const previousStock = stock?.currentStock || 0;
        const quantity = Math.abs(newStockValue - previousStock);

        // Update stock
        await DAO.stock.upsertStock(productId, {
            currentStock: newStockValue,
            lastUpdated: new Date()
        }, transaction);

        // Create transaction record
        await DAO.stock.createStockTransaction({
            productId,
            type: 'adjustment',
            quantity,
            previousStock,
            newStock: newStockValue,
            ...transactionData
        }, transaction);

        return { previousStock, newStock: newStockValue, quantity };
    },

    // Set minimum stock level
    setMinStockLevel: async (productId, minStockLevel) => {
        return await DAO.stock.upsertStock(productId, {
            minStockLevel
        });
    },

    // List stock transactions
    listStockTransactions: async (filters) => {
        return await DAO.stock.listStockTransactions(filters);
    },

    // Initialize stock for a product
    initializeStock: async (productId, initialStock = 0, minStockLevel = 0, unit = 'kg') => {
        return await db.sequelize.transaction(async (transaction) => {
            // Create stock record
            await DAO.stock.upsertStock(productId, {
                currentStock: initialStock,
                minStockLevel,
                unit,
                lastUpdated: new Date()
            }, transaction);

            // Create opening transaction if initial stock > 0
            if (initialStock > 0) {
                await DAO.stock.createStockTransaction({
                    productId,
                    type: 'in',
                    quantity: initialStock,
                    previousStock: 0,
                    newStock: initialStock,
                    referenceType: 'opening',
                    notes: 'Opening stock',
                    transactionDate: new Date()
                }, transaction);
            }

            return { currentStock: initialStock, minStockLevel, unit };
        });
    }
};
