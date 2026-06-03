/**
 * Audit today's invoices — find ₹0 totals, gaps in invoice sequence,
 * and show the real cash total.
 *
 * Run: node backend/audit-today.js
 * Run for a specific date: node backend/audit-today.js 03-06-2026
 */

'use strict';

require('dotenv').config();
const db = require('./src/models');

async function run() {
    const dateArg = process.argv[2];
    const moment  = require('moment-timezone');
    const today   = dateArg || moment().tz('Asia/Kolkata').format('DD-MM-YYYY');

    try {
        await db.sequelize.authenticate();

        // ── 1. All invoices for the day ──────────────────────────────────────
        const [all] = await db.sequelize.query(`
            SELECT
                "orderNumber",
                "orderDate",
                "customerName",
                "total",
                "paidAmount",
                "dueAmount",
                "paymentMode",
                "paymentStatus",
                "isDeleted",
                "createdAt"
            FROM orders
            WHERE "orderDate" = :today
            ORDER BY "orderNumber"
        `, { replacements: { today } });

        console.log(`\n=== ALL INVOICES for ${today} (including deleted) ===`);
        console.log(`Total rows: ${all.length}`);
        console.table(all.map(o => ({
            orderNumber:   o.orderNumber,
            total:         Number(o.total),
            paidAmount:    Number(o.paidAmount),
            paymentMode:   o.paymentMode,
            paymentStatus: o.paymentStatus,
            isDeleted:     o.isDeleted,
            customer:      (o.customerName || '').slice(0, 20),
        })));

        // ── 2. Zero-total invoices (the problematic ones) ────────────────────
        const zeroes = all.filter(o => !o.isDeleted && Number(o.total) === 0);
        if (zeroes.length > 0) {
            console.log(`\n⚠️  ZERO-TOTAL INVOICES (${zeroes.length}) — these need to be deleted and re-entered:`);
            console.table(zeroes.map(o => ({
                orderNumber: o.orderNumber,
                customer:    o.customerName,
                createdAt:   new Date(o.createdAt).toLocaleTimeString('en-IN'),
            })));
        } else {
            console.log('\n✅ No zero-total invoices found.');
        }

        // ── 3. Sequence gap check ─────────────────────────────────────────────
        const nums = all
            .map(o => parseInt(o.orderNumber?.split('/')?.[2] || '0', 10))
            .filter(n => n > 0)
            .sort((a, b) => a - b);
        const gaps = [];
        for (let i = 1; i < nums.length; i++) {
            if (nums[i] - nums[i - 1] > 1) {
                for (let g = nums[i - 1] + 1; g < nums[i]; g++) gaps.push(g);
            }
        }
        if (gaps.length > 0) {
            console.log(`\n⚠️  SEQUENCE GAPS (${gaps.length} missing numbers): ${gaps.slice(0, 20).join(', ')}${gaps.length > 20 ? '...' : ''}`);
        } else {
            console.log('\n✅ No sequence gaps in today\'s invoices.');
        }

        // ── 4. Real cash summary ─────────────────────────────────────────────
        const active     = all.filter(o => !o.isDeleted && Number(o.total) > 0);
        const cashOrders = active.filter(o => o.paymentMode === 'CASH');
        const creditOrders = active.filter(o => o.paymentMode === 'CREDIT');
        const cashTotal  = cashOrders.reduce((s, o)   => s + Number(o.total), 0);
        const creditTotal= creditOrders.reduce((s, o) => s + Number(o.total), 0);
        const grandTotal = active.reduce((s, o)        => s + Number(o.total), 0);

        console.log(`\n=== CASH DRAWER SUMMARY for ${today} ===`);
        console.log(`  Active invoices (total > 0):  ${active.length}`);
        console.log(`  CASH orders:    ${cashOrders.length.toString().padStart(3)}   ₹${cashTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
        console.log(`  CREDIT orders:  ${creditOrders.length.toString().padStart(3)}   ₹${creditTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
        console.log(`  ─────────────────────────────────────────`);
        console.log(`  GRAND TOTAL:    ${active.length.toString().padStart(3)}   ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
        if (zeroes.length > 0) {
            console.log(`\n  ⚠️  ${zeroes.length} zero-total invoices EXCLUDED from above totals.`);
            console.log(`  Delete them from the app and re-enter the correct amounts.`);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

run();
