'use strict';

/**
 * Time-injected model of the weighing scale's serial stream.
 *
 * Every method takes `now` explicitly so the behaviour is deterministic and can
 * be tested by simulating a stream — no hardware, no real clock.
 *
 * Two questions decide whether a reading may be billed:
 *
 *  1. Has the weight SETTLED?  Judged on the CURRENT RUN only: walk back from
 *     the newest reading while readings stay within tolerance of each other and
 *     stop at the first one that doesn't. Anything older (the previous item, the
 *     pan emptying, a bounce) belongs to a different weight and is ignored.
 *     An earlier version measured the spread over every reading in a fixed
 *     window, so after each addition the PREVIOUS item's readings kept the next
 *     item "unsettled" for seconds — only replugging (which cleared the buffer)
 *     made it work again.
 *     The run also stops at any silence longer than the staleness limit: when a
 *     stalled stream resumes, the first line delivered is often a buffered
 *     pre-stall reading of the previous item, which says nothing about the pan
 *     now.
 *
 *  2. Is it FRESH?  A continuously-streaming scale repeats an unchanged weight
 *     several times a second, so silence means the stream has stalled and the
 *     cached value must not be billed. Once the scale is known to stream
 *     continuously, the staleness limit tightens to a few of its longest regular
 *     gaps — never looser than the 2.5 s default.
 */

const DEFAULTS = {
    maxSamples: 40,          // buffer cap (by count)
    stableTolerance: 0.03,   // max spread within a run (scale units, kg)
    stableMinSamples: 2,     // a run needs at least this many readings
    settleMs: 400,           // ...spanning at least this long, to count as settled
    freshMs: 2500,           // staleness limit while the rate is unknown, and the ceiling
    minFreshMs: 600,         // tightest staleness limit for a fast continuous stream
    freshGapMultiple: 3,     // continuous: stale after this many regular gaps of silence
    repeatGapMs: 1000,       // identical readings closer than this count as a repeat
    continuousRepeats: 3,    // this many back-to-back identical readings => continuous
    gapCapMs: 5000,          // ignore longer gaps when learning the stream's rhythm
    maxGaps: 15,             // learn the rhythm from this many recent gaps
    minGaps: 5,              // need this many gaps before trusting it
};

// Strict parse: the whole trimmed line must be a finite number. Blank lines are
// rejected explicitly because Number('') === 0 (not NaN) — a blank keepalive
// would otherwise be recorded as a phantom 0 kg reading.
function parseLine(line) {
    const t = String(line == null ? '' : line).trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

function createScaleReader(options = {}) {
    const cfg = { ...DEFAULTS, ...options };
    const samples = []; // { value, at }
    const gaps = [];    // recent inter-reading gaps (ms) — a property of the scale
    let continuous = false; // sticky: the scale has shown it streams continuously
    let identicalRun = 0;

    // The 90th-percentile gap, not the median: when the driver delivers lines
    // in bursts (gaps of ~0 ms, then one long gap), the long gap is the
    // stream's real rhythm and must not read as a stall.
    function regularGapMs() {
        if (gaps.length < cfg.minGaps) return null;
        const sorted = [...gaps].sort((a, b) => a - b);
        return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
    }

    function staleAfterMs() {
        const g = regularGapMs();
        if (!continuous || g == null) return cfg.freshMs;
        return Math.min(cfg.freshMs, Math.max(cfg.minFreshMs, cfg.freshGapMultiple * g));
    }

    /**
     * Record one raw serial line. Returns null if the line is not a reading,
     * otherwise { value, becameContinuous }.
     */
    function ingest(line, now) {
        const value = parseLine(line);
        if (value === null) return null;
        const prev = samples[samples.length - 1];
        if (prev) {
            const gap = now - prev.at;
            if (gap >= 0 && gap <= cfg.gapCapMs) {
                gaps.push(gap);
                if (gaps.length > cfg.maxGaps) gaps.shift();
            }
            identicalRun = (value === prev.value && gap <= cfg.repeatGapMs) ? identicalRun + 1 : 1;
        } else {
            identicalRun = 1;
        }
        samples.push({ value, at: now });
        if (samples.length > cfg.maxSamples) samples.shift();

        let becameContinuous = false;
        if (!continuous && identicalRun >= cfg.continuousRepeats) {
            continuous = true;
            becameContinuous = true;
        }
        return { value, becameContinuous };
    }

    /**
     * The reading to serve. `connected` is whether the port is currently open.
     */
    function read(now, connected) {
        const latest = samples[samples.length - 1];
        if (!latest) {
            return { value: 0, isStable: false, isFresh: false, msSinceData: null, runSpanMs: 0 };
        }
        const staleAfter = staleAfterMs();
        const msSinceData = now - latest.at;
        const isFresh = Boolean(connected) && msSinceData <= staleAfter;

        // Current settled run — see the module comment.
        let lo = latest.value;
        let hi = latest.value;
        let start = latest;
        let count = 1;
        for (let i = samples.length - 2; i >= 0; i--) {
            const s = samples[i];
            if (start.at - s.at > staleAfter) break; // the stream stalled between these
            const nlo = Math.min(lo, s.value);
            const nhi = Math.max(hi, s.value);
            if (nhi - nlo > cfg.stableTolerance) break;
            lo = nlo; hi = nhi; start = s; count++;
        }
        const runSpanMs = latest.at - start.at;
        const settled = count >= cfg.stableMinSamples && runSpanMs >= cfg.settleMs;

        return { value: latest.value, isStable: settled && isFresh, isFresh, msSinceData, runSpanMs };
    }

    // Drop buffered readings (port closed/reopened). The scale's learned traits
    // — continuous streaming and its rhythm — are kept.
    function reset() {
        samples.length = 0;
        identicalRun = 0;
    }

    return {
        ingest,
        read,
        reset,
        lastAt: () => (samples.length ? samples[samples.length - 1].at : null),
        isContinuous: () => continuous,
        regularGapMs,
        staleAfterMs,
    };
}

module.exports = { createScaleReader, parseLine, DEFAULTS };
