const uuidv4 = require('uuid/v4');
const Services = require('../services');
const Validations = require('../validations');
const db = require('../models');

module.exports = {
    createPurchaseBill: async (req, res) => {
        try {
            const { error, value } = Validations.purchaseBill.validateCreatePurchaseBillObj({ ...req.body, billNumber: `PUR-${uuidv4().split('-')[0].toUpperCase()}` });
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            let { purchaseItems, ...purchaseObj } = value;

            // Calculate payment status
            if (!purchaseObj.paidAmount) purchaseObj.paidAmount = 0;
            purchaseObj.dueAmount = purchaseObj.total - purchaseObj.paidAmount;
            
            if (purchaseObj.paidAmount === 0) {
                purchaseObj.paymentStatus = 'unpaid';
            } else if (purchaseObj.paidAmount >= purchaseObj.total) {
                purchaseObj.paymentStatus = 'paid';
            } else {
                purchaseObj.paymentStatus = 'partial';
            }

            const result = await db.sequelize.transaction(async (transaction) => {
                
                const response = await Services.purchaseBill.createPurchaseBill(purchaseObj, transaction);
                const purchaseBillId = response.id;

                purchaseItems = purchaseItems.map(item => { return {...item, purchaseBillId: purchaseBillId } });
                await Services.purchaseItem.addPurchaseItems(purchaseItems, transaction);

                // Update supplier balance
                const supplier = await Services.supplier.getSupplier({ id: purchaseObj.supplierId });
                if (supplier) {
                    const newBalance = (supplier.currentBalance || 0) + purchaseObj.dueAmount;
                    await Services.supplier.updateSupplier(
                        { id: purchaseObj.supplierId },
                        { currentBalance: newBalance }
                    );
                }

                return await Services.purchaseBill.getPurchaseBill({id: purchaseBillId });
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

            const response = await Services.purchaseBill.deletePurchaseBill({ id: req.params.purchaseId });
            
            // Update supplier balance
            const supplier = await Services.supplier.getSupplier({ id: purchase.supplierId });
            if (supplier) {
                const newBalance = (supplier.currentBalance || 0) - purchase.dueAmount;
                await Services.supplier.updateSupplier(
                    { id: purchase.supplierId },
                    { currentBalance: newBalance }
                );
            }
            
            if(response){
                return res.status(200).send({
                    status:200,
                    message: 'purchase bill deleted successfully',
                    data: response
                });
            }
            
        }catch(error){
            console.log(error);
            return res.status(500).send({
                status:500,
                message: error.message
            });            
        }
    }
};
