const Services = require('../services');
const Validations = require('../validations');
const { createAuditLog } = require('../middleware/auditLogger');
const getClientIP = (req) => req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';

module.exports = {
    createSupplier: async (req, res) => {
        try {
            const { error, value } = Validations.supplier.validateCreateSupplierObj(req.body);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            // Set currentBalance equal to openingBalance if provided
            if (value.openingBalance !== undefined) {
                value.currentBalance = value.openingBalance;
            }

            const response = await Services.supplier.createSupplier(value);

            return res.status(200).send({
                status: 200,
                message: 'supplier created successfully',
                data: response
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },
    
    listSuppliers: async (req, res) => {
        try {
            const { error, value } = Validations.supplier.validateListSuppliersObj(req.query);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const response = await Services.supplier.listSuppliers(value);

            return res.status(200).send({
                status: 200,
                message: 'suppliers fetched successfully',
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

    // List suppliers with debit/credit/balance
    listSuppliersWithBalance: async (req, res) => {
        try {
            const response = await Services.supplier.listSuppliersWithBalance(req.query);

            return res.status(200).send({
                status: 200,
                message: 'suppliers with balance fetched successfully',
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

    // Get supplier with full transaction details
    getSupplierWithTransactions: async (req, res) => {
        try {
            const response = await Services.supplier.getSupplierWithTransactions(req.params.supplierId);

            if (response) {
                return res.status(200).send({
                    status: 200,
                    message: 'supplier with transactions fetched successfully',
                    data: response
                });
            }

            return res.status(400).send({
                status: 400,
                message: "supplier doesn't exist"
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },
    
    getSupplier: async (req, res) => {
        try {
            const response = await Services.supplier.getSupplier({ id: req.params.supplierId });

            if (response) {
                return res.status(200).send({
                    status: 200,
                    message: 'supplier fetched successfully',
                    data: response
                });
            }

            return res.status(400).send({
                status: 400,
                message: "supplier doesn't exist"
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },
    
    updateSupplier: async (req, res) => {
        try {
            const { error, value } = Validations.supplier.validateUpdateSupplierObj(req.body);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            // Cascade name change to all payments referencing this supplier by name
            if (value.name) {
                const db = require('../models');
                const existing = await db.supplier.findOne({ where: { id: req.params.supplierId } });
                if (existing && existing.name !== value.name) {
                    const oldName = existing.name;
                    const newName = value.name;
                    const { Op } = db.Sequelize;
                    // Prefer the partyId FK (always reliable). Fall back to matching by
                    // the old name string only for legacy/orphan rows never linked to
                    // this supplier record — otherwise a rename can leave those rows
                    // pointing at a name that no longer exists anywhere.
                    await db.payment.update(
                        { partyName: newName },
                        { where: { partyType: 'supplier', [Op.or]: [
                            { partyId: req.params.supplierId },
                            { partyId: null, partyName: oldName }
                        ] } }
                    );
                    await createAuditLog({
                        userId: req.user?.id,
                        userName: req.user?.name || req.user?.username,
                        userRole: req.user?.role,
                        action: 'UPDATE',
                        entityType: 'SUPPLIER_NAME_CHANGE',
                        entityId: req.params.supplierId,
                        entityName: newName,
                        oldValues: { name: oldName },
                        newValues: { name: newName },
                        description: `Supplier renamed: "${oldName}" → "${newName}"`,
                        ipAddress: getClientIP(req)
                    });
                }
            }

            // Set currentBalance equal to openingBalance if provided in the update payload
            if (value.openingBalance !== undefined) {
                value.currentBalance = value.openingBalance;
            }

            const response = await Services.supplier.updateSupplier(
                { id: req.params.supplierId },
                value
            );

            if (response[0] > 0) {
                return res.status(200).send({
                    status: 200,
                    message: 'supplier updated successfully'
                });
            }

            return res.status(400).send({
                status: 400,
                message: "supplier doesn't exist"
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },
    
    deleteSupplier: async (req, res) => {
        try {
            const db = require('../models');
            const supplierId = req.params.supplierId;
            const supplier = await db.supplier.findByPk(supplierId);
            if (!supplier) {
                return res.status(400).send({ status: 400, message: "supplier doesn't exist" });
            }

            // Block deletion while money is still owed either way — deleting
            // would silently erase a real payable/receivable from the books.
            const balance = Number(supplier.currentBalance) || 0;
            if (Math.abs(balance) > 0.009) {
                return res.status(400).send({
                    status: 400,
                    message: `Cannot delete "${supplier.name}" — outstanding balance of ₹${Math.abs(balance).toLocaleString('en-IN')} exists. Settle it first.`
                });
            }

            const billCount = await db.purchaseBill.count({
                where: { supplierId, isDeleted: false }
            });
            if (billCount > 0) {
                return res.status(400).send({
                    status: 400,
                    message: `Cannot delete "${supplier.name}" — ${billCount} purchase bill(s) exist. Delete those bills first.`
                });
            }

            await db.sequelize.transaction(async (transaction) => {
                // Unlink payments instead of leaving them pointing at a deleted
                // supplier (the INV-12 orphan-payment audit violation).
                // partyName is preserved so history remains readable.
                await db.sequelize.query(`
                    UPDATE payments SET "partyId" = NULL WHERE "partyId" = :id AND "partyType" = 'supplier'
                `, { replacements: { id: supplierId }, transaction });

                await db.supplier.destroy({ where: { id: supplierId }, transaction });
            });

            await createAuditLog({
                userId: req.user?.id,
                userName: req.user?.name || req.user?.username || 'System',
                userRole: req.user?.role || 'unknown',
                action: 'DELETE',
                entityType: 'SUPPLIER',
                entityId: supplierId,
                entityName: supplier.name,
                oldValues: { name: supplier.name, mobile: supplier.mobile, currentBalance: supplier.currentBalance },
                description: `Hard deleted supplier "${supplier.name}" (balance: ₹${supplier.currentBalance || 0}). Payments unlinked (partyName preserved).`,
                ipAddress: getClientIP(req)
            }).catch(e => console.warn('[AUDIT] Supplier delete log failed:', e.message));

            return res.status(200).send({
                status: 200,
                message: `Supplier "${supplier.name}" deleted. Payments unlinked (partyName preserved).`,
                data: { id: supplierId, name: supplier.name }
            });

        } catch (error) {
            console.log('Delete error caught:', error.name, error.original?.code);
            // Check if it's a foreign key constraint error
            if (error.name === 'SequelizeForeignKeyConstraintError' || error.original?.code === '23503') {
                return res.status(400).send({
                    status: 400,
                    message: "Cannot delete supplier. This supplier has associated purchase bills. Please delete related purchase bills first."
                });
            }
            
            return res.status(500).send({
                status: 500,
                message: error.message
            });            
        }
    }
};
