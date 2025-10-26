const Services = require('../services');
const Validations = require('../validations');

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
            const response = await Services.supplier.deleteSupplier({ id: req.params.supplierId });
            
            if (response) {
                return res.status(200).send({
                    status: 200,
                    message: 'supplier deleted successfully',
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
    }
};
