'use strict';

/**
 * partyBalance.js — THE canonical party-balance computation.
 *
 * There must be exactly one formula for "what does this customer owe" and
 * "what do we owe this supplier". Every endpoint that reports balances
 * (customers page, suppliers page, /reports, dashboard) must derive from
 * these functions — never from a re-typed SQL copy. Divergent copies are
 * how /reports drifted from /customers.
 *
 * Customer balance (receivable):
 *   openingBalance
 *   + SUM(orders.total)            non-deleted, matched by id OR legacy name
 *   − SUM(customer receipts)       non-deleted, excluding PAY-TOGGLE rows
 *
 * Supplier balance (payable):
 *   openingBalance
 *   + SUM(bills.total)             non-deleted
 *   − SUM(bills.paidAmount)        covers POS-paid + purchase-linked payments
 *   − SUM(other supplier payments) non-deleted, referenceType != 'purchase'
 *     (on-account / advance payouts that never touch a bill's paidAmount)
 */

const db = require('../models');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const computeCustomerOutstandings = async () => {
    const rows = await db.sequelize.query(`
        SELECT
            c.id            AS "customerId",
            c.name          AS "customerName",
            c.mobile        AS "customerMobile",
            COALESCE(c."openingBalance", 0)          AS "openingBalance",
            COALESCE(ot.total_sales, 0)              AS "totalSales",
            COALESCE(pt.total_received, 0)           AS "totalReceived",
            COALESCE(c."openingBalance", 0)
              + COALESCE(ot.total_sales, 0)
              - COALESCE(pt.total_received, 0)       AS "balance",
            COALESCE(ot.open_orders, 0)              AS "openOrderCount"
        FROM customers c
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(total), 0)                        AS total_sales,
                   COUNT(*) FILTER (WHERE "dueAmount" > 0)        AS open_orders
            FROM orders
            WHERE "isDeleted" = false
              AND ("customerId" = c.id OR ("customerName" = c.name AND "customerId" IS NULL))
        ) ot ON true
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(amount), 0) AS total_received
            FROM payments
            WHERE "partyType" = 'customer'
              AND ("partyId" = c.id OR ("partyName" = c.name AND "partyId" IS NULL))
              AND ("paymentNumber" IS NULL OR "paymentNumber" NOT LIKE 'PAY-TOGGLE-%')
              ${db.payment.rawAttributes.isDeleted ? 'AND "isDeleted" = false' : ''}
        ) pt ON true
        ORDER BY "balance" DESC
    `, { type: db.Sequelize.QueryTypes.SELECT });

    return rows.map(r => ({
        ...r,
        openingBalance: round2(r.openingBalance),
        totalSales: round2(r.totalSales),
        totalReceived: round2(r.totalReceived),
        balance: round2(r.balance),
        openOrderCount: Number(r.openOrderCount) || 0
    }));
};

const computeSupplierOutstandings = async () => {
    const rows = await db.sequelize.query(`
        SELECT
            s.id            AS "supplierId",
            s.name          AS "supplierName",
            s.mobile        AS "supplierMobile",
            COALESCE(s."openingBalance", 0)          AS "openingBalance",
            COALESCE(bt.total_bills, 0)              AS "totalPurchases",
            COALESCE(bt.total_paid, 0)               AS "paidOnBills",
            COALESCE(pt.other_payments, 0)           AS "otherPayments",
            COALESCE(s."openingBalance", 0)
              + COALESCE(bt.total_bills, 0)
              - COALESCE(bt.total_paid, 0)
              - COALESCE(pt.other_payments, 0)       AS "balance",
            COALESCE(bt.open_bills, 0)               AS "openBillCount"
        FROM suppliers s
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(total), 0)                     AS total_bills,
                   COALESCE(SUM("paidAmount"), 0)              AS total_paid,
                   COUNT(*) FILTER (WHERE "dueAmount" > 0)     AS open_bills
            FROM "purchaseBills"
            WHERE "supplierId" = s.id
              AND COALESCE("isDeleted", false) = false
        ) bt ON true
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(amount), 0) AS other_payments
            FROM payments
            WHERE "partyType" = 'supplier'
              AND ("partyId" = s.id OR ("partyName" = s.name AND "partyId" IS NULL))
              AND "referenceType" != 'purchase'
              AND ("paymentNumber" IS NULL OR "paymentNumber" NOT LIKE 'PAY-TOGGLE-%')
              ${db.payment.rawAttributes.isDeleted ? 'AND "isDeleted" = false' : ''}
        ) pt ON true
        ORDER BY "balance" DESC
    `, { type: db.Sequelize.QueryTypes.SELECT });

    return rows.map(r => ({
        ...r,
        openingBalance: round2(r.openingBalance),
        totalPurchases: round2(r.totalPurchases),
        paidOnBills: round2(r.paidOnBills),
        otherPayments: round2(r.otherPayments),
        balance: round2(r.balance),
        openBillCount: Number(r.openBillCount) || 0
    }));
};

module.exports = { computeCustomerOutstandings, computeSupplierOutstandings };
