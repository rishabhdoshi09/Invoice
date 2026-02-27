const db = require('../models');
const Services = require('../services');
const telegram = require('../services/telegramAlert');

module.exports = {
    // Log item removal from bill (called by frontend silently)
    logItemRemoved: async (req, res) => {
        try {
            const {
                productName, quantity, price, totalPrice,
                billSnapshot, billTotal, customerName,
                invoiceContext, deviceInfo
            } = req.body;

            if (!productName) {
                return res.status(400).json({ status: 400, message: 'productName is required' });
            }

            // Get the next invoice number context
            let nextInvoiceHint = invoiceContext || '';
            if (!nextInvoiceHint) {
                try {
                    const seqInfo = await Services.invoiceSequence.getSequenceInfo();
                    nextInvoiceHint = `Next: ${seqInfo.prefix}/${seqInfo.financialYear}/${seqInfo.nextNumber}`;
                } catch (e) {
                    nextInvoiceHint = 'unknown';
                }
            }

            const log = await db.billAuditLog.create({
                eventType: 'ITEM_REMOVED',
                userId: req.user?.id || null,
                userName: req.user?.name || req.user?.username || 'unknown',
                invoiceContext: nextInvoiceHint,
                productName,
                quantity: quantity || 0,
                price: price || 0,
                totalPrice: totalPrice || 0,
                billSnapshot: billSnapshot || null,
                billTotal: billTotal || 0,
                customerName: customerName || null,
                deviceInfo: deviceInfo || null
            });

            // Fire Telegram alert (non-blocking)
            telegram.alertItemDeleted({
                itemName: productName,
                quantity, price, totalPrice,
                type: req.body.itemType || 'manual',
                invoiceContext: { orderNumber: nextInvoiceHint },
                user: req.user?.name || req.user?.username,
                timestamp: new Date()
            });

            return res.status(200).json({ status: 200, data: { id: log.id } });
        } catch (error) {
            console.error('Bill audit log error:', error.message);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    // Log when entire bill is cleared/reset
    logBillCleared: async (req, res) => {
        try {
            const { billSnapshot, billTotal, customerName, invoiceContext, deviceInfo } = req.body;

            let nextInvoiceHint = invoiceContext || '';
            if (!nextInvoiceHint) {
                try {
                    const seqInfo = await Services.invoiceSequence.getSequenceInfo();
                    nextInvoiceHint = `Next: ${seqInfo.prefix}/${seqInfo.financialYear}/${seqInfo.nextNumber}`;
                } catch (e) {
                    nextInvoiceHint = 'unknown';
                }
            }

            const itemCount = billSnapshot?.length || 0;
            if (itemCount === 0) {
                return res.status(200).json({ status: 200, message: 'empty bill, nothing to log' });
            }

            const log = await db.billAuditLog.create({
                eventType: 'BILL_CLEARED',
                userId: req.user?.id || null,
                userName: req.user?.name || req.user?.username || 'unknown',
                invoiceContext: nextInvoiceHint,
                productName: `${itemCount} item(s) cleared`,
                quantity: itemCount,
                totalPrice: billTotal || 0,
                billSnapshot: billSnapshot || null,
                billTotal: billTotal || 0,
                customerName: customerName || null,
                deviceInfo: deviceInfo || null
            });

            return res.status(200).json({ status: 200, data: { id: log.id } });
        } catch (error) {
            console.error('Bill audit log error:', error.message);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    // Get tampering logs (admin only)
    getTamperingLogs: async (req, res) => {
        try {
            const { startDate, endDate, eventType, limit = 100, offset = 0 } = req.query;
            const where = {};

            if (eventType) {
                where.eventType = eventType;
            }

            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate) where.createdAt[db.Sequelize.Op.gte] = new Date(startDate);
                if (endDate) where.createdAt[db.Sequelize.Op.lte] = new Date(new Date(endDate).setHours(23, 59, 59));
            }

            const logs = await db.billAuditLog.findAndCountAll({
                where,
                order: [['createdAt', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            // Summary stats
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayLogs = await db.billAuditLog.findAll({
                where: { createdAt: { [db.Sequelize.Op.gte]: today } }
            });

            const summary = {
                todayItemRemovals: todayLogs.filter(l => l.eventType === 'ITEM_REMOVED').length,
                todayBillClears: todayLogs.filter(l => l.eventType === 'BILL_CLEARED').length,
                todayBillDeletes: todayLogs.filter(l => l.eventType === 'BILL_DELETED').length,
                todayTotalValue: todayLogs.reduce((sum, l) => sum + (Number(l.totalPrice) || 0), 0)
            };

            return res.status(200).json({
                status: 200,
                data: {
                    summary,
                    count: logs.count,
                    rows: logs.rows
                }
            });
        } catch (error) {
            console.error('Get tampering logs error:', error.message);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    // Mark weight(s) as consumed when an order is submitted
    markWeightConsumed: async (req, res) => {
        try {
            const { weightLogIds, orderId, orderNumber } = req.body;
            if (!weightLogIds || !weightLogIds.length) {
                return res.status(400).json({ status: 400, message: 'weightLogIds required' });
            }
            await db.weightLog.update(
                { consumed: true, orderId: orderId || null, orderNumber: orderNumber || null },
                { where: { id: { [db.Sequelize.Op.in]: weightLogIds } } }
            );
            return res.status(200).json({ status: 200, message: `${weightLogIds.length} weight(s) marked consumed` });
        } catch (error) {
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    // Log an explicit weight capture (called when biller clicks "Fetch Weight" button)
    logWeightCapture: async (req, res) => {
        try {
            const { weight } = req.body;
            const w = Number(weight) || 0;
            if (w <= 0) {
                return res.status(200).json({ status: 200, message: 'zero weight, not logged' });
            }
            const log = await db.weightLog.create({
                weight: w,
                userId: req.user?.id || null,
                userName: req.user?.name || req.user?.username || 'unknown'
            });
            return res.status(200).json({ status: 200, data: { id: log.id } });
        } catch (error) {
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    // Get weight logs with unmatched filter
    getWeightLogs: async (req, res) => {
        try {
            const { startDate, endDate, consumed, limit = 200, offset = 0 } = req.query;
            const where = {};

            if (consumed === 'true') where.consumed = true;
            else if (consumed === 'false') where.consumed = false;

            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate) where.createdAt[db.Sequelize.Op.gte] = new Date(startDate);
                if (endDate) where.createdAt[db.Sequelize.Op.lte] = new Date(new Date(endDate).setHours(23, 59, 59));
            }

            const logs = await db.weightLog.findAndCountAll({
                where,
                order: [['createdAt', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            // Today's summary
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayLogs = await db.weightLog.findAll({
                where: { createdAt: { [db.Sequelize.Op.gte]: today } }
            });

            const summary = {
                todayTotalFetches: todayLogs.length,
                todayConsumed: todayLogs.filter(l => l.consumed).length,
                todayUnmatched: todayLogs.filter(l => !l.consumed).length,
                todayUnmatchedWeight: todayLogs.filter(l => !l.consumed).reduce((sum, l) => sum + (Number(l.weight) || 0), 0)
            };

            return res.status(200).json({
                status: 200,
                data: {
                    summary,
                    count: logs.count,
                    rows: logs.rows
                }
            });
        } catch (error) {
            return res.status(500).json({ status: 500, message: error.message });
        }
    }
};
