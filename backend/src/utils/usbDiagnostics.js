'use strict';

const { execFile } = require('child_process');

// USB product names of common USB-serial chips found in scale cables. The
// shop's CH340 cable reports itself as "USB2.0-Ser!".
const CHIP_PATTERN = /USB2\.0-Ser|USB[ -]?Serial|CH34\d|CP210\d|FT232|UART/i;

// Given `ioreg -p IOUSB -w0` output: is a USB-serial chip on the USB bus?
function isSerialChipPresent(ioregOutput) {
    return CHIP_PATTERN.test(String(ioregOutput || ''));
}

/**
 * macOS only. When the scale's serial port disappears, tells apart the two
 * layers that can drop it: the cable's USB-serial chip still on the USB bus
 * means the driver stopped providing the port; the chip gone too means the
 * cable/USB connection itself dropped. Calls back with true/false, or null
 * when it can't tell (not macOS, ioreg failed).
 */
function checkSerialChip(callback) {
    if (process.platform !== 'darwin') return callback(null);
    execFile('ioreg', ['-p', 'IOUSB', '-w0'], { timeout: 3000 }, (err, stdout) => {
        callback(err ? null : isSerialChipPresent(stdout));
    });
}

module.exports = { isSerialChipPresent, checkSerialChip };
