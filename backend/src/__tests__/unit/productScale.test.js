/**
 * Serial-lifecycle tests for the weight endpoint: a mocked serial port plus
 * fake timers exercise the watchdog, teardown and stale-port guards in
 * controller/product.js without hardware.
 *
 * Run: npm test -- --testPathPattern=productScale
 */

jest.mock('../../services', () => ({}));
jest.mock('../../validations', () => ({}));

jest.mock('fs', () => {
    const real = jest.requireActual('fs');
    return {
        ...real,
        existsSync: jest.fn((p) => (p === '/dev/fake-scale' ? global.__scalePresent !== false : real.existsSync(p))),
    };
});

jest.mock('serialport', () => {
    const { EventEmitter } = require('events');
    const instances = [];
    class SerialPort extends EventEmitter {
        constructor(opts) { super(); this.opts = opts; this.isOpen = false; instances.push(this); }
        pipe(dest) { this.dest = dest; return dest; }
        close(cb) { this.isOpen = false; this.emit('close'); if (cb) cb(null); }
        // test helpers
        simulateOpen() { this.isOpen = true; this.emit('open'); }
        simulateLine(line) { this.dest.emit('data', line); }
        // Real serialport v12 emits 'close' with a DisconnectedError when the
        // USB device vanishes.
        simulateUnplug() {
            this.isOpen = false;
            this.emit('close', Object.assign(new Error('Port is not open'), { disconnected: true }));
        }
    }
    return { SerialPort, __instances: instances };
});

jest.mock('@serialport/parser-readline', () => {
    const { EventEmitter } = require('events');
    return { ReadlineParser: class extends EventEmitter {} };
});

let controller;
let instances;

function load() {
    controller = require('../../controller/product');
    instances = require('serialport').__instances;
}

function readWeights() {
    const res = { set: jest.fn(), status: jest.fn(() => res), send: jest.fn() };
    controller.getWeights({}, res);
    return res.send.mock.calls[0][0].data;
}

function stream(p, lines, gapMs = 100) {
    lines.forEach((line) => { jest.advanceTimersByTime(gapMs); p.simulateLine(line); });
}

const repeat = (v, n) => Array.from({ length: n }, () => v);

beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers({ now: 1000000 });
    process.env.SERIAL_PORT = '/dev/fake-scale';
    global.__scalePresent = true;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    load();
});

afterEach(() => {
    jest.useRealTimers();
    console.log.mockRestore();
    delete process.env.SERIAL_PORT;
});

test('serves a settled weight, and refuses it while the item is moving', () => {
    const p = instances[0];
    p.simulateOpen();
    stream(p, repeat('2.500', 8));
    expect(readWeights()).toMatchObject({ weight: 2.5, isStable: true, isConnected: true });

    stream(p, ['2.900']);
    expect(readWeights()).toMatchObject({ isStable: false });
});

test('the next item settles after an addition without a replug', () => {
    const p = instances[0];
    p.simulateOpen();
    stream(p, repeat('2.500', 20));
    stream(p, ['0.400', '0.000', '0.000', '1.600', '1.850', '1.780']);
    stream(p, repeat('1.800', 5));
    expect(readWeights()).toMatchObject({ weight: 1.8, isStable: true, isConnected: true });
    expect(instances).toHaveLength(1); // no reopen was needed
});

test('a silently stalled stream is reopened automatically and the old weight is never served', () => {
    const first = instances[0];
    first.simulateOpen();
    stream(first, repeat('2.500', 20)); // continuous: watchdog armed
    expect(readWeights().weight).toBe(2.5);

    // Stream stalls: port stays open, no data, no error, no close.
    jest.advanceTimersByTime(700);
    expect(readWeights()).toMatchObject({ weight: 0, isConnected: false, isStable: false });

    jest.advanceTimersByTime(1000); // watchdog fires (~1.2 s of silence)
    expect(first.isOpen).toBe(false);

    jest.advanceTimersByTime(400); // fast reconnect (0.3 s)
    expect(instances).toHaveLength(2);
    const second = instances[1];
    second.simulateOpen();
    expect(readWeights()).toMatchObject({ weight: 0, isStable: false }); // nothing from before the stall

    stream(second, repeat('1.200', 6));
    expect(readWeights()).toMatchObject({ weight: 1.2, isStable: true, isConnected: true });
});

test('events from the previous port instance cannot affect the new one', () => {
    const first = instances[0];
    first.simulateOpen();
    stream(first, repeat('2.500', 20));
    jest.advanceTimersByTime(1800); // stall -> watchdog close -> reconnect
    const second = instances[1];
    second.simulateOpen();
    stream(second, repeat('1.200', 6));

    // Late data and a late close from the old instance.
    first.simulateLine('9.999');
    first.emit('close');
    expect(readWeights()).toMatchObject({ weight: 1.2, isStable: true, isConnected: true });
    // Keep the live port streaming past the 2 s reconnect a stale close would
    // have scheduled (silence here would legitimately trip the watchdog).
    stream(second, repeat('1.200', 30));
    expect(instances).toHaveLength(2); // the stale close did not trigger a reconnect
    expect(readWeights()).toMatchObject({ weight: 1.2, isStable: true, isConnected: true });
});

test('reports the device as absent when the cable is unplugged', () => {
    const p = instances[0];
    p.simulateOpen();
    stream(p, repeat('2.500', 8));
    global.__scalePresent = false;
    p.simulateUnplug();
    expect(readWeights()).toMatchObject({ weight: 0, isConnected: false, devicePresent: false });
});

test('a replugged scale reconnects within about a second, and the logs say why', () => {
    const logs = () => console.log.mock.calls.map((c) => c.join(' '));
    const p = instances[0];
    p.simulateOpen();
    stream(p, repeat('2.500', 8));

    global.__scalePresent = false;
    p.simulateUnplug();
    expect(logs().some((l) => l.includes('USB device disconnected'))).toBe(true);

    jest.advanceTimersByTime(5000); // unplugged for 5 s
    expect(instances).toHaveLength(1);
    expect(logs().filter((l) => l.includes('USB device not found'))).toHaveLength(1); // logged once, not every poll

    global.__scalePresent = true; // plugged back in
    jest.advanceTimersByTime(1100);
    expect(instances).toHaveLength(2);
    expect(logs().some((l) => l.includes('USB device back after'))).toBe(true);

    instances[1].simulateOpen();
    stream(instances[1], repeat('3.100', 6));
    expect(readWeights()).toMatchObject({ weight: 3.1, isStable: true, isConnected: true, devicePresent: true });
});
