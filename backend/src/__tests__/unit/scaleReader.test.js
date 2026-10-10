/**
 * Unit tests for the scale-reading model. Streams are simulated with explicit
 * timestamps, so these cover real-world scale behaviour without hardware.
 *
 * Run: npm test -- --testPathPattern=scaleReader
 */

const { createScaleReader, parseLine } = require('../../utils/scaleReader');

// Feed `values` at a fixed interval starting at `t0`; returns the last timestamp.
function feed(reader, values, t0, gapMs = 100) {
    let t = t0;
    values.forEach((v, i) => {
        t = t0 + i * gapMs;
        reader.ingest(String(v), t);
    });
    return t;
}

const repeat = (v, n) => Array.from({ length: n }, () => v);

describe('scaleReader — settling', () => {
    test('REGRESSION: next item settles quickly after an addition (no replug needed)', () => {
        const r = createScaleReader();
        // Item A sits on the pan and is billed.
        let t = feed(r, repeat('2.500', 30), 0);
        // Pan is emptied, then item B is placed and bounces.
        t = feed(r, ['1.200', '0.300', '0.000', '0.000', '0.000', '1.500', '1.900', '1.750', '1.820'], t + 100);
        // B holds steady at 1.800, 100 ms apart.
        const steadyStart = t + 100;
        const t3 = feed(r, repeat('1.800', 3), steadyStart); // 200 ms of steady data
        expect(r.read(t3, true).isStable).toBe(false);

        const t5 = feed(r, repeat('1.800', 2), t3 + 100); // now 400 ms of steady data
        const reading = r.read(t5, true);
        expect(reading.isStable).toBe(true);
        expect(reading.value).toBe(1.8);
        // The old fixed-window logic needed ~2.5 s of stillness; this needs the
        // settle time only.
        expect(t5 - steadyStart).toBeLessThan(600);
    });

    test('a single reading is never settled', () => {
        const r = createScaleReader();
        r.ingest('2.5', 1000);
        expect(r.read(1000, true).isStable).toBe(false);
    });

    test('a bouncing item never settles', () => {
        const r = createScaleReader();
        const t = feed(r, ['1.0', '1.4', '1.1', '1.35', '1.05', '1.3', '1.1', '1.32'], 0);
        expect(r.read(t, true).isStable).toBe(false);
    });

    test('jitter within tolerance settles', () => {
        const r = createScaleReader();
        const t = feed(r, ['2.50', '2.51', '2.50', '2.52', '2.51', '2.50'], 0);
        const reading = r.read(t, true);
        expect(reading.isStable).toBe(true);
        expect(reading.value).toBe(2.5);
    });

    test('jitter beyond tolerance does not settle', () => {
        const r = createScaleReader();
        const t = feed(r, ['2.50', '2.55', '2.50', '2.56', '2.49', '2.55'], 0);
        expect(r.read(t, true).isStable).toBe(false);
    });

    test('a slow (1 Hz) scale can still settle', () => {
        const r = createScaleReader();
        const t = feed(r, ['3.250', '3.250'], 0, 1000);
        expect(r.read(t + 200, true).isStable).toBe(true);
    });

    test('always serves the newest value, flagged unsettled while moving', () => {
        const r = createScaleReader();
        const t = feed(r, ['1.0', '1.0', '1.0', '1.0', '1.0', '1.6'], 0);
        const reading = r.read(t, true);
        expect(reading.value).toBe(1.6);
        expect(reading.isStable).toBe(false);
    });
});

describe('scaleReader — freshness and stalls', () => {
    test('a stalled fast stream stops being billable within ~600 ms', () => {
        const r = createScaleReader();
        let t = feed(r, repeat('0.000', 20), 0); // classifies continuous, learns 100 ms gaps
        expect(r.isContinuous()).toBe(true);
        t = feed(r, repeat('2.500', 10), t + 100);
        expect(r.read(t + 500, true)).toMatchObject({ isFresh: true, isStable: true });
        // Stream stalls: the old value must not stay billable.
        expect(r.read(t + 700, true)).toMatchObject({ isFresh: false, isStable: false });
    });

    test('before the stream rate is known, the default 2.5 s limit applies', () => {
        const r = createScaleReader();
        const t = feed(r, ['2.0', '2.0'], 0, 400);
        expect(r.read(t + 2400, true).isFresh).toBe(true);
        expect(r.read(t + 2600, true).isFresh).toBe(false);
    });

    test('nothing is fresh or settled while the port is closed', () => {
        const r = createScaleReader();
        const t = feed(r, repeat('2.000', 10), 0);
        expect(r.read(t, false)).toMatchObject({ isFresh: false, isStable: false });
    });

    test('reset drops readings but keeps what was learned about the scale', () => {
        const r = createScaleReader();
        feed(r, repeat('2.000', 12), 0);
        const gap = r.regularGapMs();
        r.reset();
        expect(r.read(5000, true)).toMatchObject({ value: 0, isStable: false, isFresh: false });
        expect(r.lastAt()).toBeNull();
        expect(r.isContinuous()).toBe(true);
        expect(r.regularGapMs()).toBe(gap);
    });

    test('a buffered pre-stall reading on resume is not served as settled', () => {
        const r = createScaleReader();
        const t = feed(r, repeat('2.500', 25), 0); // item A, fast continuous stream
        // Stream stalls for 1 s; the first line delivered on resume is a
        // leftover reading of A, while the pan now holds B.
        r.ingest('2.500', t + 1000);
        expect(r.read(t + 1040, true)).toMatchObject({ value: 2.5, isFresh: true, isStable: false });
        // Live readings of B take over and settle on their own.
        const tB = feed(r, repeat('1.200', 5), t + 1100);
        expect(r.read(tB, true)).toMatchObject({ value: 1.2, isStable: true });
    });

    test('bursty delivery is not mistaken for a stalled stream', () => {
        const r = createScaleReader();
        // The driver hands over 3 lines at once, once a second.
        let last = 0;
        for (let k = 0; k < 10; k++) {
            for (let j = 0; j < 3; j++) { last = k * 1000 + j; r.ingest('2.000', last); }
        }
        expect(r.isContinuous()).toBe(true);
        // 900 ms after the last burst the reading is still current.
        expect(r.read(last + 900, true)).toMatchObject({ isFresh: true, isStable: true, value: 2 });
    });

    test('a slow continuous scale never gets a looser limit than the 2.5 s default', () => {
        const r = createScaleReader();
        feed(r, repeat('1.000', 8), 0, 1000); // 1 Hz
        expect(r.isContinuous()).toBe(true);
        expect(r.staleAfterMs()).toBe(2500);
    });
});

describe('scaleReader — line parsing', () => {
    test('blank and non-numeric lines are rejected', () => {
        expect(parseLine('')).toBeNull();
        expect(parseLine('   \r')).toBeNull();
        expect(parseLine('ST,GS,+1.2kg')).toBeNull();
        expect(parseLine('Infinity')).toBeNull();
        expect(parseLine(undefined)).toBeNull();
    });

    test('numbers parse, including a genuine zero and CRLF framing', () => {
        expect(parseLine('1.234\r')).toBe(1.234);
        expect(parseLine('0')).toBe(0);
        expect(parseLine(' +2.5 ')).toBe(2.5);
    });

    test('blank lines between readings do not create phantom 0 kg readings', () => {
        const r = createScaleReader();
        ['2.5', '', '2.5', '  ', '2.5', '\r', '2.5', '2.5'].forEach((line, i) => r.ingest(line, i * 100));
        const reading = r.read(800, true);
        expect(reading.value).toBe(2.5);
        expect(reading.isStable).toBe(true);
    });
});

