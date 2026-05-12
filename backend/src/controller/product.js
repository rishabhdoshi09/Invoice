const Services = require('../services');
const Validations = require('../validations');

let weight = 0;
let connectionStatus = 'disconnected';
let lastDataReceived = null;

const fs = require('fs');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

let port = null;
let parser = null;
let reconnectTimer = null;
let reconnectAttempts = 0;

const MAX_RECONNECT_DELAY_SEC = 30;

function detectSerialPort() {
    if (process.env.SERIAL_PORT) return process.env.SERIAL_PORT;
    try {
        const devDir = fs.readdirSync('/dev');
        const match = devDir.find(f =>
            f.startsWith('cu.usbserial') ||
            f.startsWith('cu.wchusbserial') ||
            f.startsWith('cu.SLAB_USBtoUART') ||
            f.startsWith('ttyUSB') ||
            f.startsWith('ttyS')
        );
        return match ? `/dev/${match}` : null;
    } catch { return null; }
}

function parseWeight(line) {
    const match = line.match(/[+-]?\d+(\.\d+)?/);
    if (!match) return NaN;
    return Number(match[0]);
}

function destroyPort() {
    if (port) {
        try {
            port.removeAllListeners();
            if (port.isOpen) port.close(() => {});
        } catch (_) {}
        port = null;
        parser = null;
    }
}

function scheduleReconnect(delaySec) {
    if (reconnectTimer) return;
    const delay = delaySec != null
        ? delaySec
        : Math.min(Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY_SEC);
    console.log(`[Scale] Reconnecting in ${delay}s (attempt ${reconnectAttempts + 1})`);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        initSerial();
    }, delay * 1000);
}

function initSerial() {
    const devPath = detectSerialPort();
    if (!devPath || !fs.existsSync(devPath)) {
        connectionStatus = 'disconnected';
        reconnectAttempts = Math.min(reconnectAttempts + 1, 5);
        scheduleReconnect(Math.min(Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY_SEC));
        return;
    }

    console.log(`[Scale] Opening ${devPath}`);
    try {
        port = new SerialPort({ path: devPath, baudRate: 9600 });
        parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

        port.on('open', () => {
            console.log('[Scale] Port opened');
            connectionStatus = 'connected';
            reconnectAttempts = 0;
        });

        parser.on('data', (line) => {
            const data = parseWeight(line.trim());
            if (!isNaN(data) && isFinite(data)) {
                weight = data;
                lastDataReceived = Date.now();
                connectionStatus = 'connected';
            }
        });

        port.on('error', (e) => {
            console.log('[Scale] Error:', e.message);
            connectionStatus = 'error';
            // close event fires after error and handles reconnect
        });

        port.on('close', () => {
            console.log('[Scale] Port closed');
            connectionStatus = 'disconnected';
            destroyPort();
            reconnectAttempts++;
            scheduleReconnect(Math.min(Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY_SEC));
        });

    } catch (err) {
        console.log('[Scale] Failed to open:', err.message);
        connectionStatus = 'error';
        destroyPort();
        reconnectAttempts++;
        scheduleReconnect(Math.min(Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY_SEC));
    }
}

initSerial();


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
            // Check if connection seems stale (no data in last 30 seconds while expecting continuous data)
            const isStale = lastDataReceived && (Date.now() - lastDataReceived > 30000);
            const effectiveStatus = isStale ? 'stale' : connectionStatus;

            return res.status(200).send({
                status: 200,
                message: 'weights fetched successfully',
                data: { 
                    weight: weight,
                    connectionStatus: effectiveStatus,
                    lastDataReceived: lastDataReceived,
                    isConnected: connectionStatus === 'connected' && !isStale
                }
            });

        } catch (error) {
            return res.status(500).send({
                status: 500,
                message: error
            });
        }
    }
};
