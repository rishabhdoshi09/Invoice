const { authenticate, canModify } = require('../middleware/auth');
const db = require('../models');

module.exports = (router) => {
    // GST Export - Excel/CSV with adjusted prices
    router.post('/gst-export/excel', authenticate, async (req, res) => {
        try {
            const { orders, useAdjusted, priceRules } = req.body;

            if (!orders || orders.length === 0) {
                return res.status(400).json({ status: 400, message: 'No orders provided' });
            }

            // Build CSV content
            const headers = [
                'Invoice Number',
                'Invoice Date',
                'Customer Name',
                'Customer GSTIN',
                'Place of Supply',
                'HSN Code',
                'Product Name',
                'Original Price',
                'Adjusted Price',
                'Original Quantity',
                'Adjusted Quantity',
                'Unit',
                'Line Total',
                'Taxable Value',
                'CGST Rate',
                'CGST Amount',
                'SGST Rate', 
                'SGST Amount',
                'Total Tax',
                'Invoice Total',
                'Adjustment Applied'
            ];

            const rows = [];

            for (const order of orders) {
                const items = useAdjusted && order.adjustedItems 
                    ? order.adjustedItems 
                    : order.orderItems || [];

                for (const item of items) {
                    const originalPrice = item.originalPrice || item.productPrice;
                    const originalQty = item.originalQuantity || item.quantity;
                    const taxRate = Number(order.taxPercent || 0) / 2; // Split between CGST and SGST
                    const lineTotal = Number(item.totalPrice || 0);
                    const taxAmount = lineTotal * (Number(order.taxPercent || 0) / 100);

                    rows.push([
                        order.orderNumber || '',
                        order.orderDate || '',
                        order.customerName || 'Walk-in Customer',
                        order.customerGstin || 'URP',
                        order.placeOfSupply || '27-Maharashtra',
                        '7323', // HSN code for stainless steel articles
                        item.name || '',
                        originalPrice,
                        item.productPrice,
                        Number(originalQty).toFixed(3),
                        Number(item.quantity).toFixed(3),
                        item.type === 'weighted' ? 'KG' : 'PCS',
                        lineTotal.toFixed(2),
                        lineTotal.toFixed(2),
                        taxRate.toFixed(2),
                        (taxAmount / 2).toFixed(2),
                        taxRate.toFixed(2),
                        (taxAmount / 2).toFixed(2),
                        taxAmount.toFixed(2),
                        Number(order.total || 0).toFixed(2),
                        item.adjusted ? 'Yes' : 'No'
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
