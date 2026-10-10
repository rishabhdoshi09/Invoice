/**
 * Unit tests for the USB-layer diagnostic used when the scale's serial port
 * disappears. The fixture is real `ioreg -p IOUSB -w0` output from the shop's
 * Intel MacBook Air with the CH340 scale cable plugged in.
 *
 * Run: npm test -- --testPathPattern=usbDiagnostics
 */

const { isSerialChipPresent, checkSerialChip } = require('../../utils/usbDiagnostics');

const IOREG_WITH_SCALE = `+-o Root  <class IORegistryEntry, id 0x100000100, retain 17>
  +-o AppleUSBXHCI Root Hub Simulation@14000000  <class AppleUSBRootHubDevice, id 0x10000036a, registered, matched, active, busy 0 (0 ms), retain 13>
    +-o BRCM20702 Hub@14300000  <class AppleUSBDevice, id 0x100000389, registered, matched, active, busy 0 (0 ms), retain 12>
    | +-o Bluetooth USB Host Controller@14330000  <class AppleUSBDevice, id 0x1000003af, registered, matched, active, busy 0 (1 ms), retain 18>
    +-o USB2.0-Ser!@14200000  <class AppleUSBDevice, id 0x10000096c, registered, matched,active, busy 0 (1 ms), retain 12>`;

const IOREG_WITHOUT_SCALE = IOREG_WITH_SCALE.split('\n').filter((l) => !l.includes('USB2.0-Ser!')).join('\n');

test('finds the CH340 scale cable ("USB2.0-Ser!") in real ioreg output', () => {
    expect(isSerialChipPresent(IOREG_WITH_SCALE)).toBe(true);
});

test('does not mistake the root hub or built-in Bluetooth for the scale cable', () => {
    expect(isSerialChipPresent(IOREG_WITHOUT_SCALE)).toBe(false);
});

test('recognises other common USB-serial chips', () => {
    ['USB2.0-Serial@1', 'USB Serial@1', 'CP2102 USB to UART Bridge Controller@1', 'FT232R USB UART@1']
        .forEach((name) => expect(isSerialChipPresent(`+-o ${name}`)).toBe(true));
});

test('cannot tell (null) when not on macOS', (done) => {
    if (process.platform === 'darwin') return done();
    checkSerialChip((present) => {
        expect(present).toBeNull();
        done();
    });
});
