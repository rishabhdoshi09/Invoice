'use strict';

const moment = require('moment-timezone');

/**
 * Document dates (orders.orderDate, payments.paymentDate, purchaseBills.billDate)
 * are stored as text in whatever format the screen that created them used:
 *   'DD-MM-YYYY'  invoices, customer-ledger receipts, supplier-ledger purchases
 *   'YYYY-MM-DD'  Daily Payments, Payments list
 *   'DD/MM/YYYY'  older records
 *
 * `new Date(text)` reads the DD-MM forms as American month-day: 04-09-2026
 * (4 Sep) became 9 Apr, 11-09-2026 became 9 Nov, and 25-09-2026 was invalid
 * and silently fell back to "now". Journal dates derived that way were wrong.
 * Everything here parses explicitly and validates the calendar date.
 */

const FORMATS = [
    { re: /^(\d{4})-(\d{1,2})-(\d{1,2})$/,   y: 1, m: 2, d: 3 },
    { re: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, y: 1, m: 2, d: 3 },
    { re: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,   y: 3, m: 2, d: 1 },
    { re: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, y: 3, m: 2, d: 1 },
];

const pad = (n) => String(n).padStart(2, '0');

function isRealDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// The calendar day of a Date as seen by this server (the shop's local time).
function localIso(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 'YYYY-MM-DD' for a real calendar date in any supported format (or a Date /
 * full timestamp, taken as the server's local day), otherwise null.
 */
function toIsoDate(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : localIso(value);
    const s = String(value).trim();
    for (const f of FORMATS) {
        const m = s.match(f.re);
        if (!m) continue;
        const y = Number(m[f.y]);
        const mo = Number(m[f.m]);
        const d = Number(m[f.d]);
        return isRealDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
    }
    // Full timestamps ('2026-09-04T10:00:00.000Z', or with a space instead of
    // the T as databases print them): the local day of that instant.
    if (/^\d{4}-\d{2}-\d{2}[T ]\d/.test(s)) {
        const dt = new Date(s.replace(' ', 'T'));
        return isNaN(dt.getTime()) ? null : localIso(dt);
    }
    return null;
}

/** First argument that parses, as 'YYYY-MM-DD'; null if none do. */
function firstIsoDate(...candidates) {
    for (const c of candidates) {
        const iso = toIsoDate(c);
        if (iso) return iso;
    }
    return null;
}

/**
 * Today's date where the shop is ('YYYY-MM-DD'), whatever time zone the server
 * runs in. A server on UTC (e.g. in Docker) is still on yesterday between
 * midnight and 5:30 am IST.
 */
function shopToday(now = new Date()) {
    return moment(now).tz(process.env.SHOP_TZ || 'Asia/Kolkata').format('YYYY-MM-DD');
}

/** 'YYYY-MM-DD' -> 'DD-MM-YYYY', the canonical stored format for documents. */
function isoToDmy(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
}

module.exports = { toIsoDate, firstIsoDate, isoToDmy, localIso, shopToday };
