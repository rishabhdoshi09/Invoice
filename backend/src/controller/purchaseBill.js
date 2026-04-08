const { v4: uuidv4 } = require('uuid');
const Services = require('../services');
const Validations = require('../validations');
const db = require('../models');
const { postPurchaseToLedger, reversePurchaseLedger } = require('../services/realTimeLedger');
const { updateStock } = require('../services/accountingEngine');
const { createAuditLog } = require('../middleware/auditLogger');

const round2 = (n) => Math.round(n * 100) / 100;

const getClientIP = (req) =>
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    'unknown';

module.exports = {
    createPurchaseBill: async (req, res) => {
        try {
            // Use provided billNumber or generate one if empty/missing
            const billNumber = req.body.billNumber && req.body.billNumber.trim() 
                ? req.body.billNumber.trim() 
                : `PUR-${uuidv4().split('-')[0].toUpperCase()}`;
            const { error, value } = Validations.purchaseBill.validateCreatePurchaseBillObj({ ...req.body, billNumber });
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            let { purchaseItems, ...purchaseObj } = value;

            // === SERVER-SIDE MATH: recompute totals from line items (never trust client) ===
            purchaseItems = purchaseItems.map(item => ({
                ...item,
                totalPrice: round2(Number(item.quantity) * Number(item.price))
            }));
            purchaseObj.subTotal = round2(purchaseItems.reduce((s, i) => s + i.totalPrice, 0));
            const taxPercent = typeof purchaseObj.taxPercent === 'number' ? purchaseObj.taxPercent : 0;
            purchaseObj.tax      = round2(purchaseObj.subTotal * taxPercent / 100);
            purchaseObj.taxPercent = taxPercent;
            purchaseObj.total    = round2(purchaseObj.subTotal + purchaseObj.tax);

            // Payment state: overpayment becomes advanceAmount (shown as advance to supplier)
            if (!purchaseObj.paidAmount) purchaseObj.paidAmount = 0;
            purchaseObj.paidAmount     = round2(purchaseObj.paidAmount);
            purchaseObj.dueAmount      = round2(Math.max(0, purchaseObj.total - purchaseObj.paidAmount));
            purchaseObj.advanceAmount  = round2(Math.max(0, purchaseObj.paidAmount - purchaseObj.total));

            if (purchaseObj.paidAmount <= 0.01) {
                purchaseObj.paymentStatus = 'unpaid';
            } else if (purchaseObj.paidAmount >= purchaseObj.total - 0.01) {
                purchaseObj.paymentStatus = 'paid';
            } else {
                purchaseObj.paymentStatus = 'partial';
            }

            const result = await db.sequelize.transaction(async (transaction) => {
                const response = await Services.purchaseBill.createPurchaseBill(purchaseObj, transaction);
                const purchaseBillId = response.id;

                purchaseItems = purchaseItems.map(item => ({ ...item, purchaseBillId }));
                await Services.purchaseItem.addPurchaseItems(purchaseItems, transaction);

                // Increase stock for each item with a linked product (inside transaction)
                for (const item of purchaseItems) {
                    if (item.productId) {
                        await updateStock(
                            item.productId,
                            Number(item.quantity),
                            'IN',
                            purchaseBillId,
                            'purchase',
                            transaction,
                            purchaseObj.billDate || new Date()
                        );
                    }
                }

                // Update supplier outstanding balance atomically inside the transaction.
                // dueAmount = what we still owe; advanceAmount = excess we paid.
                // Balance increases by dueAmount (we owe more), decreases by advanceAmount (we over-paid).
                if (purchaseObj.supplierId) {
                    const balanceDelta = purchaseObj.dueAmount - purchaseObj.advanceAmount;
                    if (balanceDelta !== 0) {
                        await db.supplier.update(
                            { currentBalance: db.sequelize.literal(`"currentBalance" + ${balanceDelta}`) },
                            { where: { id: purchaseObj.supplierId }, transaction }
                        );
                    }

                    // === DOUBLE-ENTRY LEDGER: AccountingEngine is the sole ledger source ===
                    const accountsExist = await db.account.count({ transaction });
                    if (accountsExist > 0) {
                        const supplier = await db.supplier.findByPk(purchaseObj.supplierId, { transaction });
                        await postPurchaseToLedger(
                            { ...purchaseObj, id: purchaseBillId, billNumber, supplierName: supplier?.name || 'Unknown Supplier', createdAt: new Date() },
                            transaction
                        );
                    } else {
                        console.warn(`[LEDGER] SKIP: Chart of Accounts not initialized — purchase ${billNumber} not posted to ledger`);
                    }
                }

                return await Services.purchaseBill.getPurchaseBill({ id: purchaseBillId });
            });

            return res.status(200).send({
                status: 200,
                message: 'purchase bill created successfully',
                data: result
            });

        } catch (error) {
            console.log(error);
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },
    
    listPurchaseBills: async (req, res) => {
        try {
            const { error, value } = Validations.purchaseBill.validateListPurchaseBillsObj(req.query);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const response = await Services.purchaseBill.listPurchaseBills(value);

            return res.status(200).send({
                status: 200,
                message: 'purchase bills fetched successfully',
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
    
    getPurchaseBill: async (req, res) => {
        try {
            const response = await Services.purchaseBill.getPurchaseBill({ id: req.params.purchaseId });

            if (response) {
                return res.status(200).send({
                    status: 200,
                    message: 'purchase bill fetched successfully',
                    data: response
                });
            }

            return res.status(400).send({
                status: 400,
                message: "purchase bill doesn't exist"
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error.message
            });
        }
    },
    
    deletePurchaseBill: async(req, res) => {
        try{
            const purchase = await Services.purchaseBill.getPurchaseBill({ id: req.params.purchaseId });
            
            if (!purchase) {
                return res.status(400).send({
                    status: 400,
                    message: "purchase bill doesn't exist"
                });
            }

            // Check if already soft-deleted
            if (purchase.isDeleted) {
                return res.status(400).send({
                    status: 400,
                    message: "This purchase bill has already been deleted"
                });
            }

            await db.sequelize.transaction(async (transaction) => {
                // Soft delete — preserves record for audit trail
                await db.purchaseBill.update(
                    {
                        isDeleted: true,
                        deletedAt: new Date(),
                        deletedBy: req.user?.id || null,
                        deletedByName: req.user?.name || req.user?.username || null
                    },
                    { where: { id: req.params.purchaseId }, transaction }
                );

                // Reverse stock: remove the units that were added when this purchase was created
                const purchaseItems = await db.purchaseItem.findAll({
                    where: { purchaseBillId: req.params.purchaseId },
                    transaction
                });
                for (const item of purchaseItems) {
                    if (item.productId) {
                        await updateStock(
                            item.productId,
                            Number(item.quantity),
                            'OUT',
                            req.params.purchaseId,
                            'purchase_reversal',
                            transaction
                        );
                    }
                }

                // Reverse supplier outstanding balance atomically (inside transaction).
                // dueAmount was added on create; advanceAmount was deducted on create.
                // Reversal: subtract dueAmount, add back advanceAmount.
                if (purchase.supplierId) {
                    const balanceDelta = (Number(purchase.dueAmount) || 0) - (Number(purchase.advanceAmount) || 0);
                    if (balanceDelta !== 0) {
                        await db.supplier.update(
                            { currentBalance: db.sequelize.literal(`"currentBalance" - ${balanceDelta}`) },
                            { where: { id: purchase.supplierId }, transaction }
                        );
                    }
                }

                // Reverse double-entry ledger batches
                try {
                    const accountsExist = await db.account.count({ transaction });
                    if (accountsExist > 0) {
                        await reversePurchaseLedger(purchase, transaction);
                    }
                } catch (ledgerError) {
                    console.error(`[LEDGER] Failed to reverse purchase ${purchase.billNumber}:`, ledgerError.message);
                    throw ledgerError;
                }
            });

            // Audit log for purchase bill deletion (MED-07)
            await createAuditLog({
                userId:     req.user?.id,
                userName:   req.user?.name || req.user?.username || 'Anonymous',
                userRole:   req.user?.role || 'unknown',
                action:     'DELETE',
                entityType: 'PURCHASE_BILL',
                entityId:   purchase.id,
                entityName: purchase.billNumber,
                oldValues: {
                    billNumber:    purchase.billNumber,
                    total:         Number(purchase.total),
                    paidAmount:    Number(purchase.paidAmount),
                    dueAmount:     Number(purchase.dueAmount),
                    paymentStatus: purchase.paymentStatus
                },
                newValues: null,
                description: `DELETED purchase bill ${purchase.billNumber} (₹${purchase.total})`,
                ipAddress:  getClientIP(req),
                userAgent:  req.headers['user-agent']
            }).catch(e => console.warn('[AUDIT] Purchase bill delete log failed:', e.message));

            return res.status(200).send({
                status: 200,
                message: 'purchase bill deleted successfully',
                data: { id: req.params.purchaseId }
            });
            
        }catch(error){
            console.log(error);
            return res.status(500).send({
                status:500,
                message: error.message
            });            
        }
    }
};
