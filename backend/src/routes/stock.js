const Controller = require('../controller');
const { authenticate, canModify } = require('../middleware/auth');

module.exports = (router) => {
    // List all stocks - authenticated users
    router
        .route('/stocks')
        .get(authenticate, Controller.stock.listStocks);

    // Get stock summary - authenticated users
    router
        .route('/stocks/summary')
        .get(authenticate, Controller.stock.getStockSummary);

    // List stock transactions - authenticated users
    router
        .route('/stocks/transactions')
        .get(authenticate, Controller.stock.listTransactions);

    // Add stock (Stock In) - admin only
    router
        .route('/stocks/in')
        .post(authenticate, canModify, Controller.stock.addStock);

    // Remove stock (Stock Out) - admin only
    router
        .route('/stocks/out')
        .post(authenticate, canModify, Controller.stock.removeStock);

    // Adjust stock - admin only
    router
        .route('/stocks/adjust')
        .post(authenticate, canModify, Controller.stock.adjustStock);

    // Initialize stock - admin only
    router
        .route('/stocks/initialize')
        .post(authenticate, canModify, Controller.stock.initializeStock);

    // Get stock for specific product - authenticated users
    router
        .route('/stocks/product/:productId')
        .get(authenticate, Controller.stock.getProductStock);

    // Set minimum stock level - admin only
    router
        .route('/stocks/product/:productId/min-level')
        .put(authenticate, canModify, Controller.stock.setMinStockLevel);
};
