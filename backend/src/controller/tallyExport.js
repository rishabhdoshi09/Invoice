const db = require('../models');

// Helper function to convert data to CSV
const convertToCSV = (headers, rows) => {
    const csvHeaders = headers.join(',');
    const csvRows = rows.map(row => {
        return row.map(cell => {
            // Escape quotes and wrap in quotes if contains comma
            if (cell === null || cell === undefined) return '';
            const cellStr = String(cell);
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
        }).join(',');
    });
    return [csvHeaders, ...csvRows].join('\n');
};

// Helper to determine Invoice Type (B2B if GSTIN present, B2C otherwise)
const getInvoiceType = (gstin) => {
    if (gstin && gstin.trim() && gstin.trim().toUpperCase() !== 'URP') {
        return 'B2B';
    }
    return 'B2C';
};

// Helper to calculate CGST/SGST/IGST based on place of supply
// If same state: split tax into CGST and SGST
// If different state: IGST
const calculateGSTBreakup = (taxAmount, taxPercent, placeOfSupply, sellerStateCode = '27') => {
    // Default to Maharashtra (27) if not specified
    const buyerStateCode = placeOfSupply ? placeOfSupply.substring(0, 2) : sellerStateCode;
    
    if (buyerStateCode === sellerStateCode) {
        // Intra-state: CGST + SGST (each half of total tax)
        const halfTax = taxAmount / 2;
        return {
            cgst: halfTax,
            sgst: halfTax,
            igst: 0,
            cgstRate: taxPercent / 2,
            sgstRate: taxPercent / 2,
            igstRate: 0
        };
    } else {
        // Inter-state: IGST (full tax)
        return {
            cgst: 0,
            sgst: 0,
            igst: taxAmount,
            cgstRate: 0,
            sgstRate: 0,
            igstRate: taxPercent
        };
    }
};

module.exports = {
    // GSTR-1 compliant export for sales
    exportGSTR1: async (req, res) => {
        try {
            const { ids } = req.body;
            const { startDate, endDate } = req.query;

            let whereClause = { isDeleted: false };
            
            if (ids && Array.isArray(ids) && ids.length > 0) {
                whereClause.id = { [db.Sequelize.Op.in]: ids };
            } else if (startDate && endDate) {
                whereClause.orderDate = {
                    [db.Sequelize.Op.between]: [startDate, endDate]
                };
            }

            const orders = await db.order.findAll({
                where: whereClause,
                include: [{ model: db.orderItems }],
                order: [['orderDate', 'ASC']]
            });

            // GSTR-1 compliant headers
            const headers = [
                'Invoice Number',
                'Invoice Date',
                'Buyer GSTIN/URP',
                'Buyer Name',
                'Place of Supply',
                'HSN Code',
                'Taxable Value',
                'Tax Rate (%)',
                'CGST Rate (%)',
                'CGST Amount',
                'SGST Rate (%)',
                'SGST Amount',
                'IGST Rate (%)',
                'IGST Amount',
                'Total Tax',
                'Invoice Value',
                'Invoice Type'
            ];

            const rows = [];
            orders.forEach(order => {
                const gstin = order.customerGstin || 'URP';
                const invoiceType = getInvoiceType(gstin);
                const placeOfSupply = order.placeOfSupply || '27-Maharashtra'; // Default to Maharashtra
                const gstBreakup = calculateGSTBreakup(
                    order.tax || 0, 
                    order.taxPercent || 18, 
                    placeOfSupply
                );

                rows.push([
                    order.orderNumber,
                    order.orderDate,
                    gstin,
                    order.customerName || '',
                    placeOfSupply,
                    '7323', // HSN code for stainless steel articles
                    order.subTotal || 0,
                    order.taxPercent || 18,
                    gstBreakup.cgstRate,
                    gstBreakup.cgst.toFixed(2),
                    gstBreakup.sgstRate,
                    gstBreakup.sgst.toFixed(2),
                    gstBreakup.igstRate,
                    gstBreakup.igst.toFixed(2),
                    order.tax || 0,
                    order.total || 0,
                    invoiceType
                ]);
            });

            const csv = convertToCSV(headers, rows);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=GSTR1_Sales_Export.csv');
            return res.status(200).send(csv);

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },

    exportSales: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;

            const whereClause = { isDeleted: false };
            if (startDate && endDate) {
                whereClause.orderDate = {
                    [db.Sequelize.Op.between]: [startDate, endDate]
                };
            }

            const orders = await db.order.findAll({
                where: whereClause,
                include: [{ model: db.orderItems }],
                order: [['orderDate', 'ASC']]
            });

            const headers = [
                'Date', 'Invoice No', 'Customer Name', 'Customer Mobile', 
                'Item Name', 'Quantity', 'Rate', 'Amount', 
                'Tax %', 'Tax Amount', 'Total', 
                'Paid Amount', 'Due Amount', 'Payment Status'
            ];

            const rows = [];
            orders.forEach(order => {
                if (order.orderItems && order.orderItems.length > 0) {
                    order.orderItems.forEach((item, index) => {
                        rows.push([
                            order.orderDate,
                            index === 0 ? order.orderNumber : '',
                            index === 0 ? order.customerName || '' : '',
                            index === 0 ? order.customerMobile || '' : '',
                            item.name,
                            item.quantity,
                            item.productPrice,
                            item.totalPrice,
                            index === 0 ? order.taxPercent : '',
                            index === 0 ? order.tax : '',
                            index === 0 ? order.total : '',
                            index === 0 ? (order.paidAmount || 0) : '',
                            index === 0 ? (order.dueAmount || 0) : '',
                            index === 0 ? (order.paymentStatus || 'paid') : ''
                        ]);
                    });
                } else {
                    rows.push([
                        order.orderDate,
                        order.orderNumber,
                        order.customerName || '',
                        order.customerMobile || '',
                        '',
                        '',
                        '',
                        '',
                        order.taxPercent,
                        order.tax,
                        order.total,
                        order.paidAmount || 0,
                        order.dueAmount || 0,
                        order.paymentStatus || 'paid'
                    ]);
                }
            });

            const csv = convertToCSV(headers, rows);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=tally_sales_export.csv');
            return res.status(200).send(csv);

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },

    exportSelectedSales: async (req, res) => {
        try {
            const { ids } = req.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return res.status(400).send({
                    status: 400,
                    message: 'Please provide an array of order IDs to export'
                });
            }

            const orders = await db.order.findAll({
                where: {
                    id: {
                        [db.Sequelize.Op.in]: ids
                    },
                    isDeleted: false
                },
                include: [{ model: db.orderItems }],
                order: [['orderDate', 'ASC']]
            });

            // GSTR-1 compliant headers
            const headers = [
                'Invoice Number',
                'Invoice Date',
                'Buyer GSTIN/URP',
                'Buyer Name',
                'Place of Supply',
                'HSN Code',
                'Taxable Value',
                'Tax Rate (%)',
                'CGST Rate (%)',
                'CGST Amount',
                'SGST Rate (%)',
                'SGST Amount',
                'IGST Rate (%)',
                'IGST Amount',
                'Total Tax',
                'Invoice Value',
                'Invoice Type'
            ];

            const rows = [];
            orders.forEach(order => {
                const gstin = order.customerGstin || 'URP';
                const invoiceType = getInvoiceType(gstin);
                const placeOfSupply = order.placeOfSupply || '27-Maharashtra';
                const gstBreakup = calculateGSTBreakup(
                    order.tax || 0, 
                    order.taxPercent || 18, 
                    placeOfSupply
                );

                rows.push([
                    order.orderNumber,
                    order.orderDate,
                    gstin,
                    order.customerName || '',
                    placeOfSupply,
                    '7323',
                    order.subTotal || 0,
                    order.taxPercent || 18,
                    gstBreakup.cgstRate,
                    gstBreakup.cgst.toFixed(2),
                    gstBreakup.sgstRate,
                    gstBreakup.sgst.toFixed(2),
                    gstBreakup.igstRate,
                    gstBreakup.igst.toFixed(2),
                    order.tax || 0,
                    order.total || 0,
                    invoiceType
                ]);
            });

            const csv = convertToCSV(headers, rows);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=GSTR1_Sales_Export.csv');
            return res.status(200).send(csv);

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },

    exportPurchases: async (req, res) => {
        try {
            const { startDate, endDate } = req.query;

            const whereClause = {};
            if (startDate && endDate) {
                whereClause.billDate = {
                    [db.Sequelize.Op.between]: [startDate, endDate]
                };
            }

            const purchases = await db.purchaseBill.findAll({
                where: whereClause,
                include: [
                    { model: db.purchaseItem },
                    { model: db.supplier }
                ],
                order: [['billDate', 'ASC']]
            });

            const headers = [
                'Date', 'Bill No', 'Supplier Name', 'Supplier Mobile', 'Supplier GSTIN',
                'Item Name', 'Quantity', 'Rate', 'Amount', 
                'Tax %', 'Tax Amount', 'Total', 
                'Paid Amount', 'Due Amount', 'Payment Status'
            ];

            const rows = [];
            purchases.forEach(purchase => {
                if (purchase.purchaseItems && purchase.purchaseItems.length > 0) {
                    purchase.purchaseItems.forEach((item, index) => {
                        rows.push([
                            purchase.billDate,
                            index === 0 ? purchase.billNumber : '',
                            index === 0 ? (purchase.supplier ? purchase.supplier.name : '') : '',
                            index === 0 ? (purchase.supplier ? purchase.supplier.mobile : '') : '',
                            index === 0 ? (purchase.supplier ? purchase.supplier.gstin : '') : '',
                            item.name,
                            item.quantity,
                            item.price,
                            item.totalPrice,
                            index === 0 ? purchase.taxPercent : '',
                            index === 0 ? purchase.tax : '',
                            index === 0 ? purchase.total : '',
                            index === 0 ? (purchase.paidAmount || 0) : '',
                            index === 0 ? (purchase.dueAmount || 0) : '',
                            index === 0 ? (purchase.paymentStatus || 'unpaid') : ''
                        ]);
                    });
                } else {
                    rows.push([
                        purchase.billDate,
                        purchase.billNumber,
                        purchase.supplier ? purchase.supplier.name : '',
                        purchase.supplier ? purchase.supplier.mobile : '',
                        purchase.supplier ? purchase.supplier.gstin : '',
                        '',
                        '',
                        '',
                        '',
                        purchase.taxPercent,
                        purchase.tax,
                        purchase.total,
                        purchase.paidAmount || 0,
                        purchase.dueAmount || 0,
                        purchase.paymentStatus || 'unpaid'
                    ]);
                }
            });

            const csv = convertToCSV(headers, rows);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=tally_purchases_export.csv');
            return res.status(200).send(csv);

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },

    exportSelectedPurchases: async (req, res) => {
        try {
            const { ids } = req.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return res.status(400).send({
                    status: 400,
                    message: 'Please provide an array of purchase bill IDs to export'
                });
            }

            const purchases = await db.purchaseBill.findAll({
                where: {
                    id: {
                        [db.Sequelize.Op.in]: ids
                    }
                },
                include: [
                    { model: db.purchaseItem },
                    { model: db.supplier }
                ],
                order: [['billDate', 'ASC']]
            });

            const headers = [
                'Date', 'Bill No', 'Supplier Name', 'Supplier Mobile', 'Supplier GSTIN',
                'Item Name', 'Quantity', 'Rate', 'Amount', 
                'Tax %', 'Tax Amount', 'Total', 
                'Paid Amount', 'Due Amount', 'Payment Status'
            ];

            const rows = [];
            purchases.forEach(purchase => {
                if (purchase.purchaseItems && purchase.purchaseItems.length > 0) {
                    purchase.purchaseItems.forEach((item, index) => {
                        rows.push([
                            purchase.billDate,
                            index === 0 ? purchase.billNumber : '',
                            index === 0 ? (purchase.supplier ? purchase.supplier.name : '') : '',
                            index === 0 ? (purchase.supplier ? purchase.supplier.mobile : '') : '',
                            index === 0 ? (purchase.supplier ? purchase.supplier.gstin : '') : '',
                            item.name,
                            item.quantity,
                            item.price,
                            item.totalPrice,
                            index === 0 ? purchase.taxPercent : '',
                            index === 0 ? purchase.tax : '',
                            index === 0 ? purchase.total : '',
                            index === 0 ? (purchase.paidAmount || 0) : '',
                            index === 0 ? (purchase.dueAmount || 0) : '',
                            index === 0 ? (purchase.paymentStatus || 'unpaid') : ''
                        ]);
                    });
                } else {
                    rows.push([
                        purchase.billDate,
                        purchase.billNumber,
                        purchase.supplier ? purchase.supplier.name : '',
                        purchase.supplier ? purchase.supplier.mobile : '',
                        purchase.supplier ? purchase.supplier.gstin : '',
                        '',
                        '',
                        '',
                        '',
                        purchase.taxPercent,
                        purchase.tax,
                        purchase.total,
                        purchase.paidAmount || 0,
                        purchase.dueAmount || 0,
                        purchase.paymentStatus || 'unpaid'
                    ]);
                }
            });

            const csv = convertToCSV(headers, rows);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=tally_purchases_export.csv');
            return res.status(200).send(csv);

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },

    exportPayments: async (req, res) => {
        try {
            const { startDate, endDate, partyType } = req.query;

            const whereClause = {};
            if (startDate && endDate) {
                whereClause.paymentDate = {
                    [db.Sequelize.Op.between]: [startDate, endDate]
                };
            }
            if (partyType) {
                whereClause.partyType = partyType;
            }

            const payments = await db.payment.findAll({
                where: whereClause,
                order: [['paymentDate', 'ASC']]
            });

            const headers = [
                'Date', 'Payment No', 'Party Name', 'Party Type', 
                'Amount', 'Reference Type', 'Reference Number', 'Notes'
            ];

            const rows = payments.map(payment => [
                payment.paymentDate,
                payment.paymentNumber,
                payment.partyName,
                payment.partyType,
                payment.amount,
                payment.referenceType,
                payment.referenceNumber || '',
                payment.notes || ''
            ]);

            const csv = convertToCSV(headers, rows);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=tally_payments_export.csv');
            return res.status(200).send(csv);

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },

    exportOutstanding: async (req, res) => {
        try {
            // Export receivables
            const orders = await db.order.findAll({
                where: {
                    paymentStatus: {
                        [db.Sequelize.Op.in]: ['unpaid', 'partial']
                    }
                },
                order: [['orderDate', 'DESC']]
            });

            // Export payables
            const purchases = await db.purchaseBill.findAll({
                where: {
                    paymentStatus: {
                        [db.Sequelize.Op.in]: ['unpaid', 'partial']
                    }
                },
                include: [{ model: db.supplier }],
                order: [['billDate', 'DESC']]
            });

            const headers = [
                'Type', 'Date', 'Reference No', 'Party Name', 'Party Mobile',
                'Total Amount', 'Paid Amount', 'Due Amount', 'Payment Status'
            ];

            const rows = [];

            orders.forEach(order => {
                rows.push([
                    'Receivable',
                    order.orderDate,
                    order.orderNumber,
                    order.customerName || '',
                    order.customerMobile || '',
                    order.total,
                    order.paidAmount || 0,
                    order.dueAmount || 0,
                    order.paymentStatus
                ]);
            });

            purchases.forEach(purchase => {
                rows.push([
                    'Payable',
                    purchase.billDate,
                    purchase.billNumber,
                    purchase.supplier ? purchase.supplier.name : '',
                    purchase.supplier ? purchase.supplier.mobile : '',
                    purchase.total,
                    purchase.paidAmount || 0,
                    purchase.dueAmount || 0,
                    purchase.paymentStatus
                ]);
            });

            const csv = convertToCSV(headers, rows);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=tally_outstanding_export.csv');
            return res.status(200).send(csv);

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    }
};
