const Services = require('../services');
const Validations = require('../validations');

module.exports = {
    createCustomer: async (req, res) => {
        try {
            const { error, value } = Validations.customer.validateCreateCustomerObj(req.body);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            if (value.openingBalance !== undefined) {
                value.currentBalance = value.openingBalance;
            }

            const response = await Services.customer.createCustomer(value);

            return res.status(200).send({
                status: 200,
                message: 'customer created successfully',
                data: response
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },
    
    listCustomers: async (req, res) => {
        try {
            const { error, value } = Validations.customer.validateListCustomersObj(req.query);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const response = await Services.customer.listCustomers(value);

            return res.status(200).send({
                status: 200,
                message: 'customers fetched successfully',
                data: response
            });

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },

    // List customers with debit/credit/balance
    listCustomersWithBalance: async (req, res) => {
        try {
            const response = await Services.customer.listCustomersWithBalance(req.query);

            return res.status(200).send({
                status: 200,
                message: 'customers with balance fetched successfully',
                data: response
            });

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },

    // Get customer with full transaction details
    getCustomerWithTransactions: async (req, res) => {
        try {
            const response = await Services.customer.getCustomerWithTransactions(req.params.customerId);

            if (response) {
                return res.status(200).send({
                    status: 200,
                    message: 'customer with transactions fetched successfully',
                    data: response
                });
            }

            return res.status(400).send({
                status: 400,
                message: "customer doesn't exist"
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },
    
    getCustomer: async (req, res) => {
        try {
            const response = await Services.customer.getCustomer({ id: req.params.customerId });

            if (response) {
                return res.status(200).send({
                    status: 200,
                    message: 'customer fetched successfully',
                    data: response
                });
            }

            return res.status(400).send({
                status: 400,
                message: "customer doesn't exist"
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },
    
    updateCustomer: async (req, res) => {
        try {
            const { error, value } = Validations.customer.validateUpdateCustomerObj(req.body);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            if (value.openingBalance !== undefined) {
                value.currentBalance = value.openingBalance;
            }

            const response = await Services.customer.updateCustomer(
                { id: req.params.customerId },
                value
            );

            if (response[0] > 0) {
                return res.status(200).send({
                    status: 200,
                    message: 'customer updated successfully'
                });
            }

            return res.status(400).send({
                status: 400,
                message: "customer doesn't exist"
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },
    
    deleteCustomer: async (req, res) => {
        try {
            const db = require('../models');
            const customerId = req.params.customerId;
            const customer = await db.customer.findByPk(customerId);
            
            if (!customer) {
                return res.status(400).send({ status: 400, message: "customer doesn't exist" });
            }

            await db.sequelize.transaction(async (transaction) => {
                // Unlink orders (set customerId to null, keep customerName for reference)
                await db.sequelize.query(`
                    UPDATE orders SET "customerId" = NULL WHERE "customerId" = :id
                `, { replacements: { id: customerId }, transaction });

                // Unlink payments
                await db.sequelize.query(`
                    UPDATE payments SET "partyId" = NULL WHERE "partyId" = :id AND "partyType" = 'customer'
                `, { replacements: { id: customerId }, transaction });

                // Hard delete
                await db.customer.destroy({ where: { id: customerId }, transaction });
            });

            return res.status(200).send({
                status: 200,
                message: `Customer "${customer.name}" hard deleted. Orders/payments unlinked (customerName preserved).`,
                data: { id: customerId, name: customer.name }
            });
            
        } catch (error) {
            return res.status(500).send({ status: 500, message: error.message });
        }
    },

    /**
     * GET /api/customers/duplicates
     * Find potential duplicate customers (same or similar names)
     */
    findDuplicates: async (req, res) => {
        try {
            const db = require('../models');
            const [duplicates] = await db.sequelize.query(`
                SELECT c1.id AS id1, c1.name AS name1, c1.mobile AS mobile1,
                       c2.id AS id2, c2.name AS name2, c2.mobile AS mobile2,
                       (SELECT COUNT(*) FROM orders WHERE ("customerId" = c1.id OR "customerName" = c1.name) AND "isDeleted" = false) AS orders1,
                       (SELECT COUNT(*) FROM orders WHERE ("customerId" = c2.id OR "customerName" = c2.name) AND "isDeleted" = false) AS orders2
                FROM customers c1
                JOIN customers c2 ON c1.id < c2.id
                    AND (LOWER(TRIM(c1.name)) = LOWER(TRIM(c2.name))
                         OR (c1.mobile IS NOT NULL AND c1.mobile != '' AND c1.mobile = c2.mobile))
                ORDER BY c1.name
            `);
            return res.status(200).json({ status: 200, data: duplicates });
        } catch (error) {
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * GET /api/customers/ghosts
     * Find ghost entries:
     * 1. Orphan names: customerName in orders but no customer record exists
     * 2. Empty customers: customer records with zero orders and zero payments
     */
    findGhosts: async (req, res) => {
        try {
            const db = require('../models');

            // Orphan names — orders reference a customerName that has no customer record
            const [orphanNames] = await db.sequelize.query(`
                SELECT DISTINCT o."customerName" AS name,
                    COUNT(*) AS order_count,
                    SUM(o.total) AS total_value,
                    SUM(o."dueAmount") AS total_due
                FROM orders o
                WHERE o."isDeleted" = false
                  AND o."customerName" IS NOT NULL AND TRIM(o."customerName") != ''
                  AND o."customerId" IS NULL
                  AND NOT EXISTS (SELECT 1 FROM customers c WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(o."customerName")))
                GROUP BY o."customerName"
                ORDER BY order_count DESC
            `);

            // Empty customers — records with no linked orders or payments
            const [emptyCustomers] = await db.sequelize.query(`
                SELECT c.id, c.name, c.mobile, c."createdAt"
                FROM customers c
                WHERE NOT EXISTS (
                    SELECT 1 FROM orders o WHERE (o."customerId" = c.id OR o."customerName" = c.name) AND o."isDeleted" = false
                )
                AND NOT EXISTS (
                    SELECT 1 FROM payments p WHERE (p."partyId" = c.id OR p."partyName" = c.name) AND p."partyType" = 'customer'
                    ${db.payment.rawAttributes.isDeleted ? 'AND p."isDeleted" = false' : ''}
                )
                ORDER BY c.name
            `);

            return res.status(200).json({
                status: 200,
                data: {
                    orphanNames,
                    emptyCustomers
                }
            });
        } catch (error) {
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * POST /api/customers/:targetId/merge
     * Merge sourceId into targetId: relink all orders, payments, allocations → delete source
     * REQUIRES: confirmText = "MERGE" to prevent accidental execution
     */
    mergeCustomer: async (req, res) => {
        try {
            const db = require('../models');
            const targetId = req.params.targetId;
            const { sourceId, confirmText } = req.body;

            if (!sourceId) return res.status(400).json({ status: 400, message: 'sourceId is required' });
            if (sourceId === targetId) return res.status(400).json({ status: 400, message: 'Cannot merge customer into itself' });
            if (confirmText !== 'MERGE') return res.status(400).json({ status: 400, message: 'Type "MERGE" to confirm this action' });

            // Admin-only check
            if (!req.user || req.user.role !== 'admin') {
                return res.status(403).json({ status: 403, message: 'Only admin can merge customers' });
            }
            const target = await db.customer.findByPk(targetId);
            const source = await db.customer.findByPk(sourceId);
            if (!target) return res.status(404).json({ status: 404, message: 'Target customer not found' });
            if (!source) return res.status(404).json({ status: 404, message: 'Source customer not found' });

            const result = await db.sequelize.transaction(async (transaction) => {
                // Relink orders: customerId + customerName
                const [, ordersUpdated] = await db.sequelize.query(`
                    UPDATE orders SET "customerId" = :targetId, "customerName" = :targetName
                    WHERE ("customerId" = :sourceId OR "customerName" = :sourceName)
                      AND "isDeleted" = false
                `, { replacements: { targetId, targetName: target.name, sourceId, sourceName: source.name }, transaction });

                // Relink payments: partyId + partyName
                const [, paymentsUpdated] = await db.sequelize.query(`
                    UPDATE payments SET "partyId" = :targetId, "partyName" = :targetName
                    WHERE "partyType" = 'customer'
                      AND ("partyId" = :sourceId OR "partyName" = :sourceName)
                `, { replacements: { targetId, targetName: target.name, sourceId, sourceName: source.name }, transaction });

                // Merge balances
                const newBalance = (Number(target.currentBalance) || 0) + (Number(source.currentBalance) || 0);
                const newOpening = (Number(target.openingBalance) || 0) + (Number(source.openingBalance) || 0);
                await target.update({ currentBalance: newBalance, openingBalance: newOpening }, { transaction });

                // Merge notes
                if (source.notes && source.notes.trim()) {
                    const mergedNotes = (target.notes || '') + (target.notes ? '\n' : '') + `[Merged from ${source.name}] ${source.notes}`;
                    await target.update({ notes: mergedNotes }, { transaction });
                }

                // Copy mobile/email if target doesn't have them
                if (!target.mobile && source.mobile) await target.update({ mobile: source.mobile }, { transaction });
                if (!target.email && source.email) await target.update({ email: source.email }, { transaction });
                if (!target.address && source.address) await target.update({ address: source.address }, { transaction });

                // Delete source customer
                await db.customer.destroy({ where: { id: sourceId }, transaction });

                return { ordersRelinked: ordersUpdated?.rowCount || 0, paymentsRelinked: paymentsUpdated?.rowCount || 0 };
            });

            return res.status(200).json({
                status: 200,
                message: `Merged "${source.name}" into "${target.name}". ${result.ordersRelinked} orders, ${result.paymentsRelinked} payments relinked.`,
                data: result
            });
        } catch (error) {
            console.error('Merge customer error:', error);
            return res.status(500).json({ status: 500, message: error.message });
        }
    },

    /**
     * POST /api/customers/:targetId/link-orphans
     * Admin explicitly links orphan orders (no customerId) to a customer by matching customerName.
     * REQUIRES: confirmText = "LINK"
     */
    linkOrphans: async (req, res) => {
        try {
            const db = require('../models');
            const targetId = req.params.targetId;
            const { orphanName, confirmText } = req.body;

            if (!orphanName) return res.status(400).json({ status: 400, message: 'orphanName is required' });
            if (confirmText !== 'LINK') return res.status(400).json({ status: 400, message: 'Type "LINK" to confirm this action' });
            if (!req.user || req.user.role !== 'admin') {
                return res.status(403).json({ status: 403, message: 'Only admin can link orphans' });
            }

            const target = await db.customer.findByPk(targetId);
            if (!target) return res.status(404).json({ status: 404, message: 'Target customer not found' });

            // Link orphan orders (customerId IS NULL, customerName matches)
            const [, ordersResult] = await db.sequelize.query(`
                UPDATE orders SET "customerId" = :targetId
                WHERE "customerId" IS NULL
                  AND LOWER(TRIM("customerName")) = LOWER(TRIM(:orphanName))
                  AND "isDeleted" = false
            `, { replacements: { targetId, orphanName } });

            // Link orphan payments
            const [, paymentsResult] = await db.sequelize.query(`
                UPDATE payments SET "partyId" = :targetId
                WHERE "partyId" IS NULL
                  AND "partyType" = 'customer'
                  AND LOWER(TRIM("partyName")) = LOWER(TRIM(:orphanName))
            `, { replacements: { targetId, orphanName } });

            return res.status(200).json({
                status: 200,
                message: `Linked orphan "${orphanName}" to "${target.name}". ${ordersResult?.rowCount || 0} orders, ${paymentsResult?.rowCount || 0} payments linked.`,
                data: { ordersLinked: ordersResult?.rowCount || 0, paymentsLinked: paymentsResult?.rowCount || 0 }
            });
        } catch (error) {
            return res.status(500).json({ status: 500, message: error.message });
        }
    }
};
