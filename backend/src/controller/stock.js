const Services = require('../services');
const Validations = require('../validations');
const db = require('../models');
const moment = require('moment');

module.exports = {
    // List all stocks with product info
    listStocks: async (req, res) => {
        try {
            const { error, value } = Validations.stock.validateListStocks(req.query);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const response = await Services.stock.listStocks(value);

            return res.status(200).send({
                status: 200,
                message: 'Stocks fetched successfully',
                data: response
            });
        } catch (error) {
            console.error('List stocks error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            });
        }
    },

    // Get stock summary
    getStockSummary: async (req, res) => {
        try {
            const response = await Services.stock.getStockSummary();

            return res.status(200).send({
                status: 200,
                message: 'Stock summary fetched successfully',
                data: response
            });
        } catch (error) {
            console.error('Get stock summary error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            });
        }
    },

    // Get stock for a specific product
    getProductStock: async (req, res) => {
        try {
            const { productId } = req.params;
            const stock = await Services.stock.getStockByProductId(productId);

            if (!stock) {
                return res.status(404).send({
                    status: 404,
                    message: 'Stock not found for this product'
                });
            }

            return res.status(200).send({
                status: 200,
                message: 'Stock fetched successfully',
                data: stock
            });
        } catch (error) {
            console.error('Get product stock error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            });
        }
    },

    // Add stock (Stock In)
    addStock: async (req, res) => {
        try {
            const { error, value } = Validations.stock.validateStockTransaction(req.body);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const { productId, quantity, notes, transactionDate } = value;

            // Verify product exists
            const product = await db.product.findByPk(productId);
            if (!product) {
                return res.status(404).send({
                    status: 404,
                    message: 'Product not found'
                });
            }

            const result = await Services.stock.addStock(productId, quantity, {
                referenceType: 'manual',
                notes: notes || 'Manual stock in',
                transactionDate: transactionDate || moment().format('YYYY-MM-DD'),
                createdBy: req.user?.id,
                createdByName: req.user?.name || req.user?.username
            });

            return res.status(200).send({
                status: 200,
                message: 'Stock added successfully',
                data: result
            });
        } catch (error) {
            console.error('Add stock error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            });
        }
    },

    // Remove stock (Stock Out)
    removeStock: async (req, res) => {
        try {
            const { error, value } = Validations.stock.validateStockTransaction(req.body);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const { productId, quantity, notes, transactionDate } = value;

            // Verify product exists
            const product = await db.product.findByPk(productId);
            if (!product) {
                return res.status(404).send({
                    status: 404,
                    message: 'Product not found'
                });
            }

            const result = await Services.stock.removeStock(productId, quantity, {
                referenceType: 'manual',
                notes: notes || 'Manual stock out',
                transactionDate: transactionDate || moment().format('YYYY-MM-DD'),
                createdBy: req.user?.id,
                createdByName: req.user?.name || req.user?.username
            });

            return res.status(200).send({
                status: 200,
                message: 'Stock removed successfully',
                data: result
            });
        } catch (error) {
            console.error('Remove stock error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            });
        }
    },

    // Adjust stock (manual correction)
    adjustStock: async (req, res) => {
        try {
            const { error, value } = Validations.stock.validateStockAdjustment(req.body);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const { productId, newStock, notes } = value;

            // Verify product exists
            const product = await db.product.findByPk(productId);
            if (!product) {
                return res.status(404).send({
                    status: 404,
                    message: 'Product not found'
                });
            }

            const result = await Services.stock.adjustStock(productId, newStock, {
                referenceType: 'manual',
                notes: notes || 'Manual stock adjustment',
                transactionDate: moment().format('YYYY-MM-DD'),
                createdBy: req.user?.id,
                createdByName: req.user?.name || req.user?.username
            });

            return res.status(200).send({
                status: 200,
                message: 'Stock adjusted successfully',
                data: result
            });
        } catch (error) {
            console.error('Adjust stock error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            });
        }
    },

    // Initialize stock for a product
    initializeStock: async (req, res) => {
        try {
            const { error, value } = Validations.stock.validateInitializeStock(req.body);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const { productId, initialStock, minStockLevel, unit } = value;

            // Verify product exists
            const product = await db.product.findByPk(productId);
            if (!product) {
                return res.status(404).send({
                    status: 404,
                    message: 'Product not found'
                });
            }

            const result = await Services.stock.initializeStock(productId, initialStock, minStockLevel, unit);

            return res.status(200).send({
                status: 200,
                message: 'Stock initialized successfully',
                data: result
            });
        } catch (error) {
            console.error('Initialize stock error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            });
        }
    },

    // List stock transactions
    listTransactions: async (req, res) => {
        try {
            const { error, value } = Validations.stock.validateListTransactions(req.query);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const response = await Services.stock.listStockTransactions(value);

            return res.status(200).send({
                status: 200,
                message: 'Stock transactions fetched successfully',
                data: response
            });
        } catch (error) {
            console.error('List stock transactions error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            });
        }
    },

    // Set minimum stock level
    setMinStockLevel: async (req, res) => {
        try {
            const { productId } = req.params;
            const { minStockLevel } = req.body;

            if (typeof minStockLevel !== 'number' || minStockLevel < 0) {
                return res.status(400).send({
                    status: 400,
                    message: 'Invalid minimum stock level'
                });
            }

            // Verify product exists
            const product = await db.product.findByPk(productId);
            if (!product) {
                return res.status(404).send({
                    status: 404,
                    message: 'Product not found'
                });
            }

            const result = await Services.stock.setMinStockLevel(productId, minStockLevel);

            return res.status(200).send({
                status: 200,
                message: 'Minimum stock level updated successfully',
                data: result
            });
        } catch (error) {
            console.error('Set min stock level error:', error);
            return res.status(500).send({
                status: 500,
                message: error.message || error
            });
        }
    }
};
