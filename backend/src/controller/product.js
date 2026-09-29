const Services = require('../services');
const Validations = require('../validations');

let weight = 0;
let connectionStatus = 'disconnected';
let lastDataReceived = null;

// Rolling buffer of the most recent raw samples so we can tell a SETTLED
// reading from a mid-settling one. Grabbing the single last streamed number
// (old behaviour) meant pressing '/' while the item was still bouncing on the
// pan, or while the scale had briefly paused, silently returned a wrong weight.
const samples = []; // [{ value, at }]
const SAMPLE_WINDOW_MS = 1200;   // only samples this recent count toward stability
const STABLE_MIN_SAMPLES = 2;    // need at least this many recent samples
const STABLE_TOLERANCE = 0.03;   // max spread (same unit as scale) to call it settled
const FRESH_MS = 2500;           // data older than this ⇒ stale (was silently 30s)

function pushSample(value) {
    const now = Date.now();
    samples.push({ value, at: now });
    while (samples.length && now - samples[0].at > SAMPLE_WINDOW_MS) samples.shift();
    lastDataReceived = now;
}

// Returns the reading to serve plus whether it has settled.
function computeReading() {
    const now = Date.now();
    const recent = samples.filter((s) => now - s.at <= SAMPLE_WINDOW_MS);
    if (!recent.length) {
        return { value: weight, isStable: false };
    }
    const values = recent.map((s) => s.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const latest = recent[recent.length - 1].value;
    const isStable = recent.length >= STABLE_MIN_SAMPLES && (max - min) <= STABLE_TOLERANCE;
    return { value: latest, isStable };
}

const fs = require('fs');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

let port = null;
let parser = null;
let reconnectTimer = null;

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

function scheduleReconnect(delaySec = 5) {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        initSerial();
    }, delaySec * 1000);
}

function initSerial() {
    const devPath = detectSerialPort();
    if (!devPath || !fs.existsSync(devPath)) {
        connectionStatus = 'disconnected';
        scheduleReconnect(10); // device not plugged in — check again in 10s
        return;
    }

    console.log("Serial device found → opening:", devPath);
    try {
        port = new SerialPort({ path: devPath, baudRate: 9600 });
        parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

        port.on('open', () => {
            console.log("Serial port opened successfully");
            connectionStatus = 'connected';
        });

        parser.on('data', (line) => {
            const data = Number(line.trim());
            if (!isNaN(data)) {
                weight = data;
                pushSample(data);
                connectionStatus = 'connected';
            }
        });

        port.on('error', (e) => {
            console.log("SerialPort Error:", e.message);
            connectionStatus = 'error';
            // 'close' event fires after error, triggering reconnect there
        });

        port.on('close', () => {
            console.log("Serial port closed — reconnecting in 2s...");
            connectionStatus = 'disconnected';
            port = null; parser = null;
            samples.length = 0; // don't let pre-disconnect samples look "fresh" after reopen
            scheduleReconnect(2);
        });

    } catch (err) {
        console.log("Failed to open serial port:", err.message);
        connectionStatus = 'error';
        port = null; parser = null;
        scheduleReconnect(2);
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
            // A live scale streams several samples/sec, so anything older than a
            // couple of seconds is a stale cached value — not the current item.
            const isStale = !lastDataReceived || (Date.now() - lastDataReceived > FRESH_MS);
            const effectiveStatus = isStale ? 'stale' : connectionStatus;
            const reading = computeReading();

            res.set('Cache-Control', 'no-store');
            return res.status(200).send({
                status: 200,
                message: 'weights fetched successfully',
                data: {
                    weight: reading.value,
                    // True only when the reading has settled AND is fresh — the
                    // frontend uses this to grab the stable weight, not a
                    // mid-settling or stale one.
                    isStable: reading.isStable && !isStale,
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
