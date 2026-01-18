const { authenticate, canModify } = require('../middleware/auth');
const db = require('../models');

module.exports = (router) => {
    // GST Export - Clean CSV format for CA (no comparison columns)
    router.post('/gst-export/excel', authenticate, async (req, res) => {
        try {
            const { orders, useAdjusted, priceRules } = req.body;

            if (!orders || orders.length === 0) {
                return res.status(400).json({ status: 400, message: 'No orders provided' });
            }

            // Clean professional format - NO comparison columns
            // Just the final values as they should appear for CA
            const headers = [
                'Invoice Number',
                'Invoice Date',
                'Customer Name',
                'Customer GSTIN',
                'Place of Supply',
                'HSN Code',
                'Product Name',
                'Rate',          // Product Price (adjusted if applicable)
                'Weight',        // Quantity (adjusted if applicable)
                'Unit',
                'Taxable Value',
                'CGST Rate',
                'CGST Amount',
                'SGST Rate', 
                'SGST Amount',
                'Total Tax',
                'Amount',
                'Invoice Total'
            ];

            const rows = [];

            // GST Rate constants (5% total = 2.5% CGST + 2.5% SGST)
            const GST_RATE = 0.05;
            const CGST_RATE = 2.5;
            const SGST_RATE = 2.5;

            for (const order of orders) {
                // Use adjusted items if available, otherwise original
                const items = useAdjusted && order.adjustedItems 
                    ? order.adjustedItems 
                    : order.orderItems || [];

                for (const item of items) {
                    const lineTotal = Number(item.totalPrice || 0);
                    
                    // Use pre-calculated GST values from frontend if available
                    let baseAmount, cgstAmount, sgstAmount;
                    if (item.baseAmount && item.cgstAmount && item.sgstAmount) {
                        baseAmount = Number(item.baseAmount);
                        cgstAmount = Number(item.cgstAmount);
                        sgstAmount = Number(item.sgstAmount);
                    } else {
                        // Calculate GST (price is inclusive, so extract base)
                        baseAmount = lineTotal / (1 + GST_RATE);
                        cgstAmount = baseAmount * (CGST_RATE / 100);
                        sgstAmount = baseAmount * (SGST_RATE / 100);
                    }
                    
                    const totalTax = cgstAmount + sgstAmount;

                    // Clean row - just the final values
                    rows.push([
                        order.orderNumber || '',
                        order.orderDate || '',
                        order.customerName || 'Walk-in Customer',
                        order.customerGstin || 'URP',
                        order.placeOfSupply || '27-Maharashtra',
                        '7323',
                        item.name || '',
                        item.productPrice,                    // Rate (final price)
                        Number(item.quantity).toFixed(3),     // Weight (final quantity)
                        item.type === 'weighted' ? 'KG' : 'PCS',
                        baseAmount.toFixed(2),
                        CGST_RATE.toFixed(2),
                        cgstAmount.toFixed(2),
                        SGST_RATE.toFixed(2),
                        sgstAmount.toFixed(2),
                        totalTax.toFixed(2),
                        lineTotal.toFixed(2),
                        Number(order.total || 0).toFixed(2)
                    ]);
                }
            }

            // Convert to CSV
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            // Set response headers for CSV download
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=GST_Export_${new Date().toISOString().split('T')[0]}.csv`);
            
            return res.send(csvContent);

        } catch (error) {
            console.error('GST Export error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    });

    // Get GST export summary
    router.get('/gst-export/summary', authenticate, async (req, res) => {
        try {
            const { startDate, endDate } = req.query;

            const whereClause = {};
            if (startDate && endDate) {
                whereClause.orderDate = {
                    [db.Sequelize.Op.between]: [startDate, endDate]
                };
            }

            const orders = await db.order.findAll({
                where: whereClause,
                include: [{ model: db.orderItems }],
                order: [['createdAt', 'DESC']]
            });

            // Calculate summary
            const summary = {
                totalOrders: orders.length,
                totalValue: orders.reduce((sum, o) => sum + Number(o.total || 0), 0),
                totalTax: orders.reduce((sum, o) => sum + Number(o.tax || 0), 0),
                b2bCount: orders.filter(o => o.customerGstin && o.customerGstin.toUpperCase() !== 'URP').length,
                b2cCount: orders.filter(o => !o.customerGstin || o.customerGstin.toUpperCase() === 'URP').length
            };

            return res.json({ status: 200, data: summary });

        } catch (error) {
            console.error('GST Summary error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    });

    // Log GST export action for audit
    router.post('/gst-export/log', authenticate, async (req, res) => {
        try {
            const { action, orderCount, dateRange, priceRules } = req.body;

            // Create audit log entry
            await db.auditLog.create({
                userId: req.user.id,
                action: 'GST_EXPORT',
                entityType: 'BATCH_EXPORT',
                entityId: null,
                changes: JSON.stringify({
                    action,
                    orderCount,
                    dateRange,
                    priceRules,
                    exportedAt: new Date().toISOString()
                }),
                performedBy: req.user.username
            });

            return res.json({ status: 200, message: 'Export logged successfully' });

        } catch (error) {
            console.error('GST Export log error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    });
};
