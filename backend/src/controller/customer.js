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
            const response = await Services.customer.deleteCustomer({ id: req.params.customerId });
            
            if (response) {
                return res.status(200).send({
                    status: 200,
                    message: 'customer deleted successfully',
                    data: response
                });
            }

            return res.status(400).send({
                status: 400,
                message: "customer doesn't exist"
            });
            
        } catch (error) {
            if (error.name === 'SequelizeForeignKeyConstraintError' || error.original?.code === '23503') {
                return res.status(400).send({
                    status: 400,
                    message: "Cannot delete customer. This customer has associated orders. Please delete related orders first."
                });
            }
            
            return res.status(500).send({
                status: 500,
                message: error.message
            });            
        }
    }
};
