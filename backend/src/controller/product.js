const Services = require('../services');
const Validations = require('../validations');

const fs = require('fs');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { createScaleReader } = require('../utils/scaleReader');

// Settling/freshness logic lives in the pure, unit-tested scale reader.
const reader = createScaleReader();

// Scale log lines carry the time, so USB drop-outs can be matched against what
// was happening (sleep, unlock, cable bumped) and how often they occur.
function scaleLog(...parts) {
    console.log(`[SCALE ${new Date().toLocaleTimeString("en-GB", { hour12: false })}]`, ...parts);
}

let connectionStatus = 'disconnected';
let port = null;
let parser = null;
let reconnectTimer = null;

// Silence diagnostic — LOG ONLY, it never touches the port. A stall watchdog
// that reopened silent ports was removed: it looped forever on scales sending
// more than ~1.2 s apart, could leave the port dead after a failed close, and
// misfired when the event loop was busy. Field logs only ever showed the USB
// device itself disconnecting, which the close/reconnect path handles. This
// records whether a port ever goes silent while open, so that can be judged
// on evidence.
const SILENCE_LOG_MS = 3000;
let openedAt = 0;
let silentSince = 0;

// While the scale's USB device is missing from /dev, look for it every second
// so a replugged scale works again almost immediately (was every 10 s).
const DEVICE_POLL_SEC = 1;
let deviceMissingSince = 0;

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

// Forget the connection and everything read on it, so a reopened port can
// never serve the previous item's weight.
function teardown() {
    port = null; parser = null;
    reader.reset();
    silentSince = 0;
}

function initSerial() {
    const devPath = detectSerialPort();
    if (!devPath || !fs.existsSync(devPath)) {
        connectionStatus = 'disconnected';
        if (!deviceMissingSince) {
            deviceMissingSince = Date.now();
            scaleLog("Scale USB device not found — will reconnect automatically as soon as it is back");
        }
        scheduleReconnect(DEVICE_POLL_SEC);
        return;
    }
    if (deviceMissingSince) {
        scaleLog(`Scale USB device back after ${Math.round((Date.now() - deviceMissingSince) / 1000)}s`);
        deviceMissingSince = 0;
    }

    scaleLog("Serial device found → opening:", devPath);
    try {
        const p = new SerialPort({ path: devPath, baudRate: 9600 });
        const lineParser = p.pipe(new ReadlineParser({ delimiter: '\n' }));
        port = p;
        parser = lineParser;
        // Events from a previous (closed) port instance must not tear down or
        // feed data into the current one.
        const isCurrent = () => port === p;

        p.on('open', () => {
            if (!isCurrent()) return;
            scaleLog("Serial port opened successfully");
            connectionStatus = 'connected';
            openedAt = Date.now();
        });

        lineParser.on('data', (line) => {
            if (!isCurrent()) return;
            const result = reader.ingest(line, Date.now());
            if (!result) return; // blank/non-numeric line — see parseLine
            connectionStatus = 'connected';
            if (result.becameContinuous) {
                scaleLog("Scale streams continuously");
            }
            if (silentSince) {
                scaleLog(`Scale data resumed after ${Math.round((Date.now() - silentSince) / 1000)}s of silence`);
                silentSince = 0;
            }
        });

        p.on('error', (e) => {
            if (!isCurrent()) return;
            scaleLog("SerialPort Error:", e.message);
            connectionStatus = 'error';
            // A 'close' normally follows on unplug and reconnects there. Some
            // errors (transient I/O, or a failed async open) fire WITHOUT a
            // 'close', which would strand the port until a process restart.
            if (p.isOpen) {
                p.close(); // 'close' handler tears down and reconnects
            } else {
                teardown();
                scheduleReconnect(2);
            }
        });

        p.on('close', (err) => {
            if (!isCurrent()) return;
            const delay = 1;
            // serialport passes a DisconnectedError when the USB device itself
            // vanished (cable, port, power or driver) — distinct from a close.
            const why = err && err.disconnected
                ? `USB device disconnected (${err.message})`
                : 'closed';
            scaleLog(`Serial port ${why} — reconnecting in ${delay}s...`);
            connectionStatus = 'disconnected';
            teardown();
            scheduleReconnect(delay);
        });

    } catch (err) {
        scaleLog("Failed to open serial port:", err.message);
        connectionStatus = 'error';
        teardown();
        scheduleReconnect(2);
    }
}

setInterval(() => {
    // Silence is only abnormal for a scale known to stream continuously.
    if (silentSince || !port || !port.isOpen || !reader.isContinuous()) return;
    const since = reader.lastAt() || openedAt;
    if (!since || Date.now() - since <= SILENCE_LOG_MS) return;
    silentSince = since;
    scaleLog(`Scale port is open but has sent no data for ${Math.round((Date.now() - since) / 1000)}s — if weight fetch keeps failing, replug the scale's USB`);
}, 1000).unref();

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
            const portOpen = connectionStatus === 'connected' && Boolean(port && port.isOpen);
            const reading = reader.read(Date.now(), portOpen);
            // Fresh = the port is open AND data is still arriving; a stalled
            // stream's last value is the previous item's, not the current one.
            const isConnected = reading.isFresh;
            const effectiveStatus = isConnected
                ? 'connected'
                : (connectionStatus === 'connected' ? 'stale' : connectionStatus);
            const devPath = detectSerialPort();

            res.set('Cache-Control', 'no-store');
            return res.status(200).send({
                status: 200,
                message: 'weights fetched successfully',
                data: {
                    // Never advertise a positive weight when stale/disconnected —
                    // serve 0, which every consumer's zero-guard rejects.
                    weight: isConnected ? reading.value : 0,
                    // True only when the CURRENT item's readings have settled and
                    // are fresh; the frontend waits for this before filling.
                    isStable: reading.isStable,
                    isConnected,
                    connectionStatus: effectiveStatus,
                    lastDataReceived: reader.lastAt(),
                    msSinceData: reading.msSinceData,
                    // Lets the frontend fail fast when the cable is unplugged
                    // instead of waiting for a recovery that can't happen.
                    devicePresent: Boolean(devPath && fs.existsSync(devPath)),
                    recovering: Boolean(reconnectTimer),
                    streamMode: reader.isContinuous() ? 'continuous' : 'unknown'
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
