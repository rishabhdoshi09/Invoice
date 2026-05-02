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
let reconnectDelay = 2000;       // starts at 2 s, doubles each attempt
const MAX_RECONNECT_DELAY = 32000; // cap at 32 s
const STALE_THRESHOLD_MS  = 15000; // no data for 15 s → stale
const HEARTBEAT_INTERVAL_MS = 5000; // check every 5 s

// Auto-detect serial device: prefer env var, then scan /dev for usbserial/wchusbserial
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

function destroyPort() {
    if (port) {
        try { port.removeAllListeners(); } catch {}
        try { if (port.isOpen) port.close(); } catch {}
        try { port.destroy(); } catch {}
        port = null;
        parser = null;
    }
}

function scheduleReconnect() {
    if (reconnectTimer) return; // already pending
    console.log(`[SERIAL] Reconnect scheduled in ${reconnectDelay / 1000}s...`);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        initSerial();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

function initSerial() {
    destroyPort();

    const devPath = detectSerialPort();
    if (!devPath || !fs.existsSync(devPath)) {
        console.log('[SERIAL] Device not found → will retry');
        connectionStatus = 'disconnected';
        scheduleReconnect();
        return;
    }

    console.log('[SERIAL] Opening:', devPath);
    try {
        port = new SerialPort({ path: devPath, baudRate: 9600 });
        parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

        port.on('open', () => {
            console.log('[SERIAL] Port opened successfully');
            connectionStatus = 'connected';
            reconnectDelay = 2000; // reset backoff on successful open
        });

        parser.on('data', (line) => {
            const data = Number(line.trim());
            if (!isNaN(data)) {
                // Update timestamp on every valid line, not just when value changes.
                // The scale continuously sends the same reading while stable — we must
                // still treat that as "alive".
                lastDataReceived = Date.now();
                connectionStatus = 'connected';
                if (data !== weight) weight = data;
            }
        });

        port.on('error', (e) => {
            console.log('[SERIAL] Error:', e.message);
            connectionStatus = 'error';
            scheduleReconnect();
        });

        port.on('close', () => {
            console.log('[SERIAL] Port closed');
            connectionStatus = 'disconnected';
            port = null;
            parser = null;
            scheduleReconnect();
        });

    } catch (err) {
        console.log('[SERIAL] Failed to open:', err.message);
        connectionStatus = 'error';
        scheduleReconnect();
    }
}

initSerial();

// Heartbeat: detect silent failures (port open but no data arriving) and trigger reconnect.
setInterval(() => {
    const isStale = lastDataReceived !== null &&
        (Date.now() - lastDataReceived > STALE_THRESHOLD_MS);

    if (connectionStatus === 'connected' && isStale) {
        console.log('[SERIAL] Heartbeat: no data received for', Math.round((Date.now() - lastDataReceived) / 1000), 's — forcing reconnect');
        connectionStatus = 'stale';
        destroyPort();
        scheduleReconnect();
        return;
    }

    // If we're in a broken state and no reconnect is pending, kick one off.
    if ((connectionStatus === 'error' || connectionStatus === 'disconnected') && !reconnectTimer) {
        scheduleReconnect();
    }
}, HEARTBEAT_INTERVAL_MS);


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
            const isStale = lastDataReceived !== null &&
                (Date.now() - lastDataReceived > STALE_THRESHOLD_MS);
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
