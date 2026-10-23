/**
 * Document dates are stored as text in several formats. These tests pin the
 * parsing that journal dates and date edits depend on — in particular that
 * DD-MM-YYYY is never read as American month-day.
 *
 * Run: npm test -- --testPathPattern=docDate
 */

const { toIsoDate, firstIsoDate, isoToDmy } = require('../../utils/docDate');

describe('toIsoDate', () => {
    test.each([
        ['04-09-2026', '2026-09-04'],   // 4 Sep — new Date() read this as 9 Apr
        ['11-09-2026', '2026-09-11'],   // 11 Sep — new Date() read this as 9 Nov
        ['25-09-2026', '2026-09-25'],   // new Date() found this invalid -> "now"
        ['04/09/2026', '2026-09-04'],
        ['2026-09-04', '2026-09-04'],
        ['4-9-2026', '2026-09-04'],
        [' 04-09-2026 ', '2026-09-04'],
    ])('%s -> %s', (input, expected) => {
        expect(toIsoDate(input)).toBe(expected);
    });

    test.each(['31-02-2026', '29-02-2026', '00-09-2026', '04-13-2026', 'tomorrow', '', null, undefined, '2026/09/04'])(
        'rejects %p', (input) => {
            expect(toIsoDate(input)).toBeNull();
        });

    test('accepts a leap day', () => {
        expect(toIsoDate('29-02-2028')).toBe('2028-02-29');
    });

    test('a Date object gives the local calendar day', () => {
        expect(toIsoDate(new Date(2026, 8, 4, 0, 30))).toBe('2026-09-04');
    });
});

test('firstIsoDate skips values that do not parse', () => {
    expect(firstIsoDate('garbage', '04-09-2026')).toBe('2026-09-04');
    expect(firstIsoDate(null, undefined)).toBeNull();
});

test('isoToDmy writes the canonical stored format and round-trips', () => {
    expect(isoToDmy('2026-10-01')).toBe('01-10-2026');
    expect(toIsoDate(isoToDmy('2026-10-01'))).toBe('2026-10-01');
});
