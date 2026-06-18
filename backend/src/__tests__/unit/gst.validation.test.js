/**
 * Unit tests for GST validation rules.
 *
 * The business logic is extracted here as a pure function mirroring
 * the inline validation in controller/order.js (createOrder + updateOrder).
 * These tests are database-free and run instantly.
 *
 * Indian GST rules under test:
 *  1. IGST (inter-state) and CGST/SGST (intra-state) are mutually exclusive.
 *  2. When tax is declared, the sum of the splits must equal tax (±0.02 tolerance).
 *
 * Run: npm test -- --testPathPattern=gst.validation
 */

// ─── Pure helper mirroring controller/order.js validation ────────────────────

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {{ cgst?: number, sgst?: number, igst?: number, tax?: number }} fields
 * @returns {{ valid: boolean, message?: string }}
 */
function validateGst({ cgst = 0, sgst = 0, igst = 0, tax = 0 } = {}) {
    cgst = Number(cgst);
    sgst = Number(sgst);
    igst = Number(igst);
    tax  = Number(tax);

    if (igst > 0 && (cgst > 0 || sgst > 0)) {
        return {
            valid:   false,
            message: 'GST validation error: IGST (inter-state) and CGST/SGST (intra-state) cannot both be non-zero on the same invoice.',
        };
    }

    const split = round2(cgst + sgst + igst);
    if (tax > 0 && Math.abs(split - tax) > 0.02) {
        return {
            valid:   false,
            message: `GST validation error: cgst(${cgst}) + sgst(${sgst}) + igst(${igst}) = ${split}, but tax = ${tax}. Splits must sum to tax.`,
        };
    }

    return { valid: true };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GST mutual exclusivity (IGST ⊕ CGST/SGST)', () => {
    it('accepts pure IGST (inter-state supply)', () => {
        expect(validateGst({ igst: 18, tax: 18 })).toMatchObject({ valid: true });
    });

    it('accepts CGST + SGST (intra-state supply)', () => {
        expect(validateGst({ cgst: 9, sgst: 9, tax: 18 })).toMatchObject({ valid: true });
    });

    it('accepts CGST-only (partial input)', () => {
        expect(validateGst({ cgst: 5, tax: 5 })).toMatchObject({ valid: true });
    });

    it('rejects IGST + CGST combination', () => {
        const result = validateGst({ igst: 18, cgst: 9, tax: 27 });
        expect(result).toMatchObject({ valid: false });
        expect(result.message).toMatch(/cannot both be non-zero/i);
    });

    it('rejects IGST + SGST combination', () => {
        expect(validateGst({ igst: 18, sgst: 9 })).toMatchObject({ valid: false });
    });

    it('rejects IGST + CGST + SGST combination', () => {
        expect(validateGst({ igst: 18, cgst: 9, sgst: 9 })).toMatchObject({ valid: false });
    });
});

describe('GST split-sum-to-tax check', () => {
    it('passes when splits exactly equal declared tax', () => {
        expect(validateGst({ cgst: 9, sgst: 9, tax: 18 })).toMatchObject({ valid: true });
    });

    it('passes when splits differ from tax by ≤0.02 (float rounding tolerance)', () => {
        expect(validateGst({ cgst: 9.01, sgst: 9.00, tax: 18 })).toMatchObject({ valid: true });
        expect(validateGst({ cgst: 8.99, sgst: 9.00, tax: 18 })).toMatchObject({ valid: true });
    });

    it('fails when splits differ from tax by >0.02', () => {
        const result = validateGst({ cgst: 9, sgst: 9, tax: 20 });
        expect(result).toMatchObject({ valid: false });
        expect(result.message).toMatch(/must sum to tax/i);
    });

    it('passes when tax is 0 regardless of split values (no tax declared)', () => {
        // Tax-exempt invoice — splits are informational only
        expect(validateGst({ cgst: 9, sgst: 9, tax: 0 })).toMatchObject({ valid: true });
    });

    it('passes when everything is zero (zero-rated / no tax invoice)', () => {
        expect(validateGst({ cgst: 0, sgst: 0, igst: 0, tax: 0 })).toMatchObject({ valid: true });
    });

    it('passes with IGST matching declared tax', () => {
        expect(validateGst({ igst: 12, tax: 12 })).toMatchObject({ valid: true });
    });

    it('fails with IGST not matching declared tax', () => {
        expect(validateGst({ igst: 12, tax: 18 })).toMatchObject({ valid: false });
    });
});

describe('GST edge cases', () => {
    it('handles string inputs (as they arrive from req.body)', () => {
        // req.body fields are strings; controller casts with Number()
        expect(validateGst({ cgst: '9', sgst: '9', tax: '18' })).toMatchObject({ valid: true });
        expect(validateGst({ igst: '18', cgst: '9' })).toMatchObject({ valid: false });
    });

    it('handles undefined/missing fields gracefully (empty object = valid)', () => {
        expect(validateGst({})).toMatchObject({ valid: true });
    });

    it('rejects when tax is set but all splits are zero', () => {
        // Tax declared but no breakdown provided
        expect(validateGst({ tax: 18 })).toMatchObject({ valid: false });
    });
});
