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
const MAX_SAMPLES = 20;          // cap the buffer by COUNT, not time, so a slow
                                 // scale (1-2 Hz) still keeps prior readings
const STABLE_MIN_SAMPLES = 2;    // need at least this many fresh agreeing readings
const STABLE_TOLERANCE = 0.03;   // max spread (same unit as scale) to call it settled
const SETTLE_MS = 250;           // the agreeing readings must span >= this long, so
                                 // two samples that happen to be close DURING a fast
                                 // bounce don't read as "settled"
const FRESH_MS = 2500;           // data older than this ⇒ stale (was silently 30s)

function pushSample(value) {
    samples.push({ value, at: Date.now() });
    while (samples.length > MAX_SAMPLES) samples.shift();
    lastDataReceived = samples[samples.length - 1].at;
}

// Returns the reading to serve plus whether it has SETTLED. Stability is judged
// on a settle DURATION (spread within tolerance over >= SETTLE_MS), independent
// of the scale's sample rate — a 1 Hz steady scale can qualify, while a bouncing
// fast scale cannot. Keeping this rate-independent is what lets slow scales bill.
function computeReading() {
    if (!samples.length) {
        return { value: weight, isStable: false };
    }
    const now = Date.now();
    const latest = samples[samples.length - 1];
    // Walk backwards collecting only samples that are themselves fresh.
    const trailing = [];
    for (let i = samples.length - 1; i >= 0; i--) {
        if (now - samples[i].at > FRESH_MS) break;
        trailing.unshift(samples[i]);
    }
    let isStable = false;
    if (trailing.length >= STABLE_MIN_SAMPLES) {
        const vals = trailing.map((s) => s.value);
        const spread = Math.max(...vals) - Math.min(...vals);
        const span = latest.at - trailing[0].at;
        isStable = spread <= STABLE_TOLERANCE && span >= SETTLE_MS;
    }
    return { value: latest.value, isStable };
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
            const t = line.trim();
            // Reject empty/whitespace lines: Number('') === 0 (NOT NaN), so a
            // blank keepalive or stray delimiter would otherwise record a phantom
            // 0 kg sample, poison the stability spread, and keep the feed looking
            // "fresh" while the scale is actually silent. Number.isFinite also
            // rejects Infinity. A genuine numeric "0" the scale sends is kept.
            if (!t) return;
            const data = Number(t);
            if (!Number.isFinite(data)) return;
            weight = data;
            pushSample(data);
            connectionStatus = 'connected';
        });

        port.on('error', (e) => {
            console.log("SerialPort Error:", e.message);
            connectionStatus = 'error';
            // A 'close' normally follows on unplug and reconnects there. But some
            // errors (transient I/O, or a failed async open) fire WITHOUT a
            // 'close', which would strand the port dead until a process restart.
            // Recover in both cases; scheduleReconnect's timer guard dedupes if a
            // 'close' does also arrive.
            if (port && port.isOpen) {
                port.close(); // 'close' handler nulls refs, clears samples, reconnects
            } else {
                port = null; parser = null;
                weight = 0; samples.length = 0;
                scheduleReconnect(2);
            }
        });

        port.on('close', () => {
            console.log("Serial port closed — reconnecting in 2s...");
            connectionStatus = 'disconnected';
            port = null; parser = null;
            weight = 0;         // drop the phantom last reading so a stale poll can't serve it
            samples.length = 0; // don't let pre-disconnect samples look "fresh" after reopen
            scheduleReconnect(2);
        });

    } catch (err) {
        console.log("Failed to open serial port:", err.message);
        connectionStatus = 'error';
        port = null; parser = null;
        weight = 0; samples.length = 0;
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
            const isConnected = connectionStatus === 'connected' && !isStale;
            const reading = computeReading();

            res.set('Cache-Control', 'no-store');
            return res.status(200).send({
                status: 200,
                message: 'weights fetched successfully',
                data: {
                    // Never advertise a positive weight when stale/disconnected:
                    // the module `weight` keeps the PREVIOUS item's value across a
                    // drop, and returning it let a dead scale bill that phantom kg.
                    // Serve 0 instead, which every consumer's zero-guard rejects.
                    weight: isConnected ? reading.value : 0,
                    // True only when the reading has settled AND is fresh — the
                    // frontend uses this to grab the stable weight, not a
                    // mid-settling or stale one.
                    isStable: reading.isStable && !isStale,
                    connectionStatus: effectiveStatus,
                    lastDataReceived: lastDataReceived,
                    isConnected: isConnected
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
