const Services = require('../services');
const Validations = require('../validations');

let weight = 0;
let connectionStatus = 'disconnected'; // 'connected', 'disconnected', 'error'
let lastDataReceived = null; // Timestamp of last data received

const fs = require('fs');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const devPath = '/dev/cu.usbserial-1420';
let port = null;
let parser = null;

// SAFE SERIAL INITIALIZATION
if (fs.existsSync(devPath)) {
    console.log("Serial device found → opening:", devPath);

    try {
        port = new SerialPort({
            path: devPath,
            baudRate: 9600
        });

        parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

        port.on('open', () => {
            console.log("Serial port opened successfully");
            connectionStatus = 'connected';
        });

        parser.on('data', (line) => {
            const data = Number(line.trim());
            if (!isNaN(data) && data !== weight) {
                weight = data;
                lastDataReceived = Date.now();
                connectionStatus = 'connected';
            }
        });

        port.on('error', (e) => {
            console.log("SerialPort Error:", e.message);
            connectionStatus = 'error';
        });

        port.on('close', () => {
            console.log("Serial port closed");
            connectionStatus = 'disconnected';
        });

    } catch (err) {
        console.log("Failed to open serial port:", err.message);
        connectionStatus = 'error';
    }

} else {
    console.log("Serial device NOT found → skipping serial initialization");
    connectionStatus = 'disconnected';
}


module.exports = {
    addProduct: async (req, res) => {
        try {
            const { error, value } = Validations.product.validateAddProductObj(req.body);
            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const response = await Services.product.addProduct(value);

            return res.status(200).send({
                status: 200,
                message: 'product added successfully',
                data: response
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error
            });
        }
    },

    updateProduct: async (req, res) => {
        try {
            const { error, value } = Validations.product.validateUpdateProductObj({
                id: req.params.productId,
                ...req.body
            });

            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const response = await Services.product.updateProduct(value);

            return res.status(200).send({
                status: 200,
                message: 'product updated successfully',
                data: response
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error
            });
        }
    },

    listProducts: async (req, res) => {
        try {
            const { error, value } = Validations.product.validateListProductsObj(req.params);

            if (error) {
                return res.status(400).send({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const response = await Services.product.listProducts(value);

            return res.status(200).send({
                status: 200,
                message: 'products fetched successfully',
                data: response
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error
            });
        }
    },

    getProduct: async (req, res) => {
        try {
            const response = await Services.product.getProduct({
                id: req.params.productId
            });

            if (response) {
                return res.status(200).send({
                    status: 200,
                    message: 'product fetched successfully',
                    data: response
                });
            }

            return res.status(400).send({
                status: 400,
                message: "product doesn't exist"
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error
            });
        }
    },

    deleteProduct: async (req, res) => {
        try {
            const response = await Services.product.deleteProduct({
                id: req.params.productId
            });

            if (response) {
                return res.status(200).send({
                    status: 200,
                    message: 'product deleted successfully',
                    data: response
                });
            }

            return res.status(400).send({
                status: 400,
                message: "product doesn't exist"
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error
            });
        }
    },

    getWeights: async (req, res) => {
        try {
            return res.status(200).send({
                status: 200,
                message: 'weights fetched successfully',
                data: { weight: weight }
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error
            });
        }
    }
};
