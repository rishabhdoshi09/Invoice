/**
 * Integration tests for moving a payment / purchase to another date, against a
 * REAL Postgres built from the app's migrations, using the real accounting
 * engine to post the journal entries being moved.
 *
 * Skipped unless RUN_DB_TESTS=1, and refuses any database whose name does not
 * end in "_test" — it truncates the tables it uses.
 *
 * Run against a scratch database that has had `npx sequelize db:migrate` (plus
 * the startup column bootstrap in index.js) applied:
 *   RUN_DB_TESTS=1 DB_PORT=55432 npx jest --testPathPattern=documentDate.int
 */

const enabled = process.env.RUN_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;

suite('changing a document date (real Postgres)', () => {
    let db, engine, changeDocumentDate, uuid;
    let supplierId, productId, otherProductId;
    const admin = { id: null, name: 'Owner', role: 'admin' };

    const q = async (sql, replacements = {}) =>
        db.sequelize.query(sql, { replacements, type: db.sequelize.QueryTypes.SELECT });
    const day = (col) => `to_char(("${col}" AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;

    async function batchDates(referenceId) {
        return q(`SELECT "referenceType", "isReversed", ${day('transactionDate')} AS d
                    FROM journal_batches WHERE "referenceId" = :referenceId ORDER BY "createdAt"`, { referenceId });
    }
    async function lineDates(referenceId) {
        const rows = await q(`SELECT to_char(le."transactionDate", 'YYYY-MM-DD') AS d
                                FROM ledger_entries le JOIN journal_batches jb ON jb.id = le."batchId"
                               WHERE jb."referenceId" = :referenceId AND jb."isReversed" = false`, { referenceId });
        return rows.map((r) => r.d);
    }
    async function trialBalance() {
        return q(`SELECT "accountId", SUM(debit) - SUM(credit) AS net FROM ledger_entries GROUP BY "accountId" ORDER BY "accountId"`);
    }
    async function auditCount(entityId) {
        const [r] = await q(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE "entityId" = :entityId`, { entityId });
        return r.n;
    }

    async function insertSupplierPayment(paymentDate, amount) {
        const id = uuid();
        await db.sequelize.query(
            `INSERT INTO payments (id, "paymentNumber", "paymentDate", "partyId", "partyName", "partyType", amount, "referenceType", "isDeleted", "createdAt", "updatedAt")
             VALUES (:id, :num, :paymentDate, :supplierId, 'ramu vatii', 'supplier', :amount, 'advance', false, now(), now())`,
            { replacements: { id, num: `PAY-${id.slice(0, 8).toUpperCase()}`, paymentDate, supplierId, amount } });
        const payment = await db.payment.findByPk(id);
        await db.sequelize.transaction((t) => engine.postSupplierPayment(payment, supplierId, 'ramu vatii', t));
        return payment;
    }

    async function insertPurchase(billDate, total) {
        const id = uuid();
        await db.sequelize.query(
            `INSERT INTO "purchaseBills" (id, "billNumber", "billDate", "supplierId", total, "subTotal", "isDeleted", "createdAt", "updatedAt")
             VALUES (:id, :num, :billDate, :supplierId, :total, :total, false, now(), now())`,
            { replacements: { id, num: `PUR-${id.slice(0, 8).toUpperCase()}`, billDate, supplierId, total } });
        const purchase = await db.purchaseBill.findByPk(id);
        await db.sequelize.transaction(async (t) => {
            await engine.postPurchaseBill({ ...purchase.get({ plain: true }), supplierName: 'ramu vatii' }, t);
            await engine.updateStock(productId, 10, 'IN', id, 'purchase', t, billDate);
        });
        return purchase;
    }

    beforeAll(async () => {
        if (!/_test$/.test(process.env.DATABASE_NAME || '')) {
            throw new Error(`Refusing to run: DATABASE_NAME "${process.env.DATABASE_NAME}" does not end in _test`);
        }
        db = require('../../models');
        engine = require('../../services/accountingEngine');
        ({ changeDocumentDate } = require('../../services/documentDate'));
        uuid = require('uuid').v4;

        await db.sequelize.query(`TRUNCATE ledger_entries, journal_batches, stock_transactions, audit_logs,
                                  payments, "purchaseBills", accounts, suppliers, products, customers,
                                  orders, "orderItems", receipt_allocations, daily_summaries CASCADE`);
        const LedgerService = require('../../services/ledgerService');
        await new LedgerService(db).initializeChartOfAccounts();
        await engine.ensureGSTAccounts();

        supplierId = uuid();
        await db.sequelize.query(`INSERT INTO suppliers (id, name, "createdAt", "updatedAt") VALUES (:id, 'ramu vatii', now(), now())`,
            { replacements: { id: supplierId } });
        // products.id's migration default is a single fixed UUID, so supply ids.
        productId = uuid();
        otherProductId = uuid();
        await db.sequelize.query(
            `INSERT INTO products (id, name, "createdAt", "updatedAt") VALUES (:a, 'Steel bowl', now(), now()), (:b, 'Steel plate', now(), now())`,
            { replacements: { a: productId, b: otherProductId } });
    });

    afterAll(async () => { if (db) await db.sequelize.close(); });

    test('a DD-MM-YYYY payment is posted to the journal on the right day (was 9 Apr)', async () => {
        const p = await insertSupplierPayment('04-09-2026', 25000);
        const [batch] = await batchDates(p.id);
        expect(batch).toMatchObject({ referenceType: 'PAYMENT', d: '2026-09-04' });
        expect(await lineDates(p.id)).toEqual(['2026-09-04', '2026-09-04']);
    });

    test('a document date that cannot be read is reported, not silently replaced', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const p = await insertSupplierPayment('4th Sept', 900);
            expect((await batchDates(p.id))[0].d).toMatch(/^\d{4}-\d{2}-\d{2}$/); // posted on the creation day
            expect(warn.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/Unreadable document date "4th Sept"/);
        } finally {
            warn.mockRestore();
        }
    });

    test('moving a payment moves its journal batch and lines, and is audited', async () => {
        const p = await insertSupplierPayment('06-09-2026', 21200);
        const tbBefore = await trialBalance();

        const result = await changeDocumentDate({ kind: 'payment', id: p.id, newDate: '2026-09-11', user: admin });

        expect(result).toMatchObject({ changed: true, oldDate: '06-09-2026', newDate: '11-09-2026', journalBatches: 1, ledgerLines: 2 });
        expect((await db.payment.findByPk(p.id)).paymentDate).toBe('11-09-2026');
        expect((await batchDates(p.id))[0].d).toBe('2026-09-11');
        expect(await lineDates(p.id)).toEqual(['2026-09-11', '2026-09-11']);
        expect(await trialBalance()).toEqual(tbBefore); // no balance anywhere changes

        const [log] = await q(`SELECT action, "entityType", "oldValues", "newValues", "userName" FROM audit_logs WHERE "entityId" = :id`, { id: p.id });
        expect(log).toMatchObject({
            action: 'UPDATE', entityType: 'PAYMENT', userName: 'Owner',
            oldValues: { paymentDate: '06-09-2026' }, newValues: { paymentDate: '11-09-2026' },
        });
    });

    test("only the payment's ACTIVE batch moves — reversed history and other payments stay put", async () => {
        const a = await insertSupplierPayment('10-09-2026', 24000);
        const b = await insertSupplierPayment('10-09-2026', 2655);
        // Give A a reversed historical batch plus a fresh active one.
        await db.sequelize.transaction(async (t) => {
            await engine.reversePayment(a, t);
            await engine.postSupplierPayment(a, supplierId, 'ramu vatii', t);
        });

        await changeDocumentDate({ kind: 'payment', id: a.id, newDate: '2026-09-01', user: admin });

        const rows = await batchDates(a.id);
        expect(rows.find((r) => r.referenceType === 'PAYMENT' && !r.isReversed).d).toBe('2026-09-01');
        expect(rows.find((r) => r.referenceType === 'PAYMENT' && r.isReversed).d).toBe('2026-09-10');
        expect((await batchDates(b.id))[0].d).toBe('2026-09-10');
    });

    test('moving a purchase also moves its stock movements, and nothing else', async () => {
        const pur = await insertPurchase('02-09-2026', 68610);
        await db.sequelize.transaction((t) => engine.updateStock(otherProductId, 5, 'IN', uuid(), 'purchase', t, '02-09-2026'));
        const tbBefore = await trialBalance();

        const result = await changeDocumentDate({ kind: 'purchase', id: pur.id, newDate: '05-09-2026', user: admin });

        expect(result).toMatchObject({ changed: true, newDate: '05-09-2026', journalBatches: 1, stockMovements: 1 });
        expect((await db.purchaseBill.findByPk(pur.id)).billDate).toBe('05-09-2026');
        expect((await batchDates(pur.id))[0]).toMatchObject({ referenceType: 'PURCHASE', d: '2026-09-05' });
        const stock = await q(`SELECT "productId", to_char("transactionDate", 'YYYY-MM-DD') AS d FROM stock_transactions WHERE "transactionDate" IS NOT NULL ORDER BY "createdAt"`);
        expect(stock.find((s) => s.productId === productId).d).toBe('2026-09-05');
        expect(stock.find((s) => s.productId === otherProductId).d).toBe('2026-09-02');
        expect(await trialBalance()).toEqual(tbBefore);
    });

    test('the new date is stored in the canonical DD-MM-YYYY, whatever the old format', async () => {
        const p = await insertSupplierPayment('2026-09-04', 2535);
        await changeDocumentDate({ kind: 'payment', id: p.id, newDate: '2026-09-08', user: admin });
        expect((await db.payment.findByPk(p.id)).paymentDate).toBe('08-09-2026');
    });

    test("legacy MIGRATION entries of the same payment move with it", async () => {
        const p = await insertSupplierPayment('04-09-2026', 3100);
        const LedgerService = require('../../services/ledgerService');
        const [cash, other] = await q(`SELECT id FROM accounts ORDER BY code LIMIT 2`);
        await new LedgerService(db).createJournalBatch({
            referenceType: 'MIGRATION', referenceId: p.id, description: `Migration: Payment ${p.paymentNumber}`,
            transactionDate: '2026-09-04',
            entries: [{ accountId: cash.id, debit: 50, credit: 0 }, { accountId: other.id, debit: 0, credit: 50 }],
        });
        const result = await changeDocumentDate({ kind: 'payment', id: p.id, newDate: '2026-09-09', user: admin });
        expect(result.journalBatches).toBe(2);
        expect((await batchDates(p.id)).map((b) => [b.referenceType, b.d]).sort())
            .toEqual([['MIGRATION', '2026-09-09'], ['PAYMENT', '2026-09-09']]);
    });

    test("refuses a date before the supplier's opening balance date", async () => {
        const p = await insertSupplierPayment('10-09-2026', 1500);
        await db.sequelize.query(`UPDATE suppliers SET "openingBalanceDate" = '2026-09-05' WHERE id = :id`, { replacements: { id: supplierId } });
        try {
            await expect(changeDocumentDate({ kind: 'payment', id: p.id, newDate: '2026-09-03', user: admin }))
                .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/opening balance date \(05\/09\/2026\)/) });
            // On or after the opening balance date is fine.
            await expect(changeDocumentDate({ kind: 'payment', id: p.id, newDate: '2026-09-05', user: admin }))
                .resolves.toMatchObject({ changed: true });
        } finally {
            await db.sequelize.query(`UPDATE suppliers SET "openingBalanceDate" = NULL WHERE id = :id`, { replacements: { id: supplierId } });
        }
        expect((await db.payment.findByPk(p.id)).paymentDate).toBe('05-09-2026');
    });

    test('the same date is a no-op and is not audited', async () => {
        const p = await insertSupplierPayment('04-09-2026', 4290);
        const result = await changeDocumentDate({ kind: 'payment', id: p.id, newDate: '2026-09-04', user: admin });
        expect(result.changed).toBe(false);
        expect(await auditCount(p.id)).toBe(0);
    });

    test.each([
        ['a future date', '2099-01-01', 400, /future/],
        ['an impossible date', '31-02-2026', 400, /valid date/],
        ['no date', undefined, 400, /valid date/],
    ])('rejects %s and changes nothing', async (_label, newDate, status, message) => {
        const p = await insertSupplierPayment('04-09-2026', 1000);
        await expect(changeDocumentDate({ kind: 'payment', id: p.id, newDate, user: admin }))
            .rejects.toMatchObject({ status, message: expect.stringMatching(message) });
        expect((await db.payment.findByPk(p.id)).paymentDate).toBe('04-09-2026');
        expect((await batchDates(p.id))[0].d).toBe('2026-09-04');
        expect(await auditCount(p.id)).toBe(0);
    });

    test('rejects deleted and unknown documents', async () => {
        const p = await insertSupplierPayment('04-09-2026', 1000);
        await db.sequelize.query(`UPDATE payments SET "isDeleted" = true WHERE id = :id`, { replacements: { id: p.id } });
        await expect(changeDocumentDate({ kind: 'payment', id: p.id, newDate: '2026-09-05' })).rejects.toMatchObject({ status: 400 });
        await expect(changeDocumentDate({ kind: 'payment', id: uuid(), newDate: '2026-09-05' })).rejects.toMatchObject({ status: 404 });
        await expect(changeDocumentDate({ kind: 'purchase', id: 'not-a-uuid', newDate: '2026-09-05' })).rejects.toMatchObject({ status: 404 });
    });

    async function insertRawPayment(fields) {
        const id = uuid();
        const row = {
            id, paymentNumber: `PAY-${id.slice(0, 8).toUpperCase()}`, paymentDate: '04-09-2026', partyId: null,
            partyName: 'someone', partyType: 'customer', amount: 500, referenceType: 'advance', referenceId: null, ...fields,
        };
        await db.sequelize.query(
            `INSERT INTO payments (id, "paymentNumber", "paymentDate", "partyId", "partyName", "partyType", amount, "referenceType", "referenceId", "isDeleted", "createdAt", "updatedAt")
             VALUES (:id, :paymentNumber, :paymentDate, :partyId, :partyName, :partyType, :amount, :referenceType, :referenceId, false, now(), now())`,
            { replacements: row });
        return row;
    }

    test('only customer receipts and supplier payments can be re-dated', async () => {
        const salary = await insertRawPayment({ partyType: 'employee', referenceType: 'salary' });
        await expect(changeDocumentDate({ kind: 'payment', id: salary.id, newDate: '2026-09-05' }))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/Only customer receipts and supplier payments/) });
        const toggle = await insertRawPayment({ paymentNumber: `PAY-TOGGLE-${uuid().slice(0, 6)}` });
        await expect(changeDocumentDate({ kind: 'payment', id: toggle.id, newDate: '2026-09-05' }))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/mirrors an invoice/) });
        const receipt = await insertRawPayment({});
        await expect(changeDocumentDate({ kind: 'payment', id: receipt.id, newDate: '2026-09-05', user: admin }))
            .resolves.toMatchObject({ changed: true, newDate: '05-09-2026' });
    });

    test('a receipt matched to customers by name only is held to their opening balance date (the latest one)', async () => {
        for (const [id, ob] of [[uuid(), '2026-09-01'], [uuid(), '2026-09-05']]) {
            await db.sequelize.query(
                `INSERT INTO customers (id, name, "openingBalanceDate", "createdAt", "updatedAt") VALUES (:id, 'Walk-in Ramesh', :ob, now(), now())`,
                { replacements: { id, ob } });
        }
        const r = await insertRawPayment({ partyId: null, partyName: 'Walk-in Ramesh', partyType: 'customer', paymentDate: '10-09-2026' });
        await expect(changeDocumentDate({ kind: 'payment', id: r.id, newDate: '2026-09-03' }))
            .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/Walk-in Ramesh's opening balance date \(05\/09\/2026\)/) });
        await expect(changeDocumentDate({ kind: 'payment', id: r.id, newDate: '2026-09-06', user: admin }))
            .resolves.toMatchObject({ changed: true });
    });

    test('refuses moving an entry into or out of a closed day', async () => {
        await db.sequelize.query(`INSERT INTO daily_summaries (id, date, "isClosed", "createdAt", "updatedAt") VALUES (:id, '2026-09-07', true, now(), now())`,
            { replacements: { id: uuid() } });
        try {
            const p = await insertSupplierPayment('04-09-2026', 700);
            await expect(changeDocumentDate({ kind: 'payment', id: p.id, newDate: '2026-09-07', user: admin }))
                .rejects.toMatchObject({ status: 400, message: '07/09/2026 is a closed day. Reopen it first.' });
            const q2 = await insertSupplierPayment('07-09-2026', 800);
            await expect(changeDocumentDate({ kind: 'payment', id: q2.id, newDate: '2026-09-08', user: admin }))
                .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/closed day/) });
            expect((await db.payment.findByPk(q2.id)).paymentDate).toBe('07-09-2026');
        } finally {
            await db.sequelize.query(`DELETE FROM daily_summaries WHERE date = '2026-09-07'`);
        }
    });

    describe('invoice date edits (real controllers)', () => {
        let orderController;
        const call = async (handler, req) => {
            const res = { statusCode: 200, body: null };
            res.status = (c) => { res.statusCode = c; return res; };
            res.send = res.json = (b) => { res.body = b; return res; };
            res.set = () => res;
            await handler({ user: { id: uuid(), name: 'Owner', role: 'admin' }, headers: {}, params: {}, query: {}, ...req }, res);
            return res;
        };
        const item = { name: 'Steel bowl', quantity: 2, productPrice: 300, totalPrice: 600, type: 'weighted' };

        beforeAll(() => { orderController = require('../../controller/order'); });

        async function createCashInvoice(orderDate) {
            const res = await call(orderController.createOrder, { body: {
                orderDate, customerName: 'Walk-in', subTotal: 600, total: 600, tax: 0,
                paidAmount: 600, paymentStatus: 'paid', paymentMode: 'CASH', orderItems: [item],
            } });
            expect(res.statusCode).toBe(200);
            return res.body.data;
        }

        test('a date-only invoice edit moves its journal entries (they used to stay on the old date)', async () => {
            const order = await createCashInvoice('04-09-2026');
            expect((await batchDates(order.id)).map((b) => b.d)).toEqual(['2026-09-04', '2026-09-04']); // INVOICE + INVOICE_CASH

            const res = await call(orderController.updateOrder, { params: { orderId: order.id }, body: { orderDate: '01-09-2026' } });

            expect(res.statusCode).toBe(200);
            const rows = await batchDates(order.id);
            expect(rows.filter((r) => !r.isReversed).map((r) => [r.referenceType, r.d]).sort())
                .toEqual([['INVOICE', '2026-09-01'], ['INVOICE_CASH', '2026-09-01']]);
            expect(await lineDates(order.id)).toEqual(expect.arrayContaining(['2026-09-01']));
            expect(new Set(await lineDates(order.id))).toEqual(new Set(['2026-09-01']));
        });

        test("a receipt that is a cash invoice's money can't move onto or off that invoice's day", async () => {
            const order = await createCashInvoice('04-09-2026');
            // Same-day receipt for the cash invoice: Day Start skips it, so moving it off would double count.
            const sameDay = await insertRawPayment({ referenceType: 'order', referenceId: order.id, paymentDate: '04-09-2026' });
            await expect(changeDocumentDate({ kind: 'payment', id: sameDay.id, newDate: '2026-09-06' }))
                .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/cash taken with invoice .* \(04\/09\/2026\)\. Change the invoice's date instead/) });
            // A later receipt for it: moving onto the invoice's day would hide it; elsewhere is fine.
            const later = await insertRawPayment({ referenceType: 'order', referenceId: order.id, paymentDate: '06-09-2026' });
            await expect(changeDocumentDate({ kind: 'payment', id: later.id, newDate: '2026-09-04' }))
                .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/paid in cash on 04\/09\/2026/) });
            await expect(changeDocumentDate({ kind: 'payment', id: later.id, newDate: '2026-09-08', user: admin }))
                .resolves.toMatchObject({ changed: true });
        });

        test("following that advice works: the invoice's same-day receipt moves with it, so Day Start counts the cash once", async () => {
            const dailySummary = require('../../services/dailySummary');
            const day = async (iso) => {
                const s = await dailySummary.getRealTimeSummary(iso);
                return { cashSales: Number(s.cashSales), receipts: Number(s.customerReceipts) };
            };
            const LedgerService = require('../../services/ledgerService');
            const [a1, a2] = await q(`SELECT id FROM accounts ORDER BY code LIMIT 2`);

            const order = await createCashInvoice('16-06-2026');
            const sameDay = await insertRawPayment({ referenceType: 'order', referenceId: order.id, paymentDate: '16-06-2026', amount: 600 });
            await new LedgerService(db).createJournalBatch({
                referenceType: 'PAYMENT', referenceId: sameDay.id, transactionDate: '2026-06-16', description: 'same-day receipt',
                entries: [{ accountId: a1.id, debit: 600, credit: 0 }, { accountId: a2.id, debit: 0, credit: 600 }],
            });
            const later = await insertRawPayment({ referenceType: 'order', referenceId: order.id, paymentDate: '18-06-2026', amount: 50 });
            expect(await day('2026-06-16')).toEqual({ cashSales: 600, receipts: 0 });

            const res = await call(orderController.updateOrder, { params: { orderId: order.id }, body: { orderDate: '13-06-2026' } });

            expect(res.statusCode).toBe(200);
            expect((await db.payment.findByPk(sameDay.id)).paymentDate).toBe('13-06-2026');
            expect((await batchDates(sameDay.id))[0].d).toBe('2026-06-13');
            expect((await db.payment.findByPk(later.id)).paymentDate).toBe('18-06-2026'); // a later receipt keeps its day
            // The cash is counted once, on the new day, and not left behind as a receipt.
            expect(await day('2026-06-13')).toEqual({ cashSales: 600, receipts: 0 });
            expect(await day('2026-06-16')).toEqual({ cashSales: 0, receipts: 0 });
            const [log] = await q(`SELECT "oldValues", "newValues" FROM audit_logs WHERE "entityId" = :id`, { id: sameDay.id });
            expect(log).toMatchObject({ oldValues: { paymentDate: '16-06-2026' }, newValues: { paymentDate: '13-06-2026' } });
        });

        test('the repair script fixes wrong journal dates, leaves history and oddities alone, and is idempotent', async () => {
            const { planRepair, applyRepair } = require('../../../scripts/repair-journal-dates');
            const LedgerService = require('../../services/ledgerService');
            const ledger = new LedgerService(db);
            const [a1, a2] = await q(`SELECT id FROM accounts ORDER BY code LIMIT 2`);
            const post = (referenceType, referenceId, transactionDate) => ledger.createJournalBatch({
                referenceType, referenceId, transactionDate, description: `seed ${referenceType}`,
                entries: [{ accountId: a1.id, debit: 10, credit: 0 }, { accountId: a2.id, debit: 0, credit: 10 }],
            });
            // The bugs, as they landed in real books:
            const swapped = await insertRawPayment({ paymentDate: '04-09-2026' });
            await post('PAYMENT', swapped.id, '2026-04-09');             // 4 Sep read as 9 Apr
            const entryDay = await insertRawPayment({ paymentDate: '25-09-2026' });
            await post('PAYMENT', entryDay.id, '2026-10-01');            // invalid -> the day it was entered
            const invoice = await createCashInvoice('04-09-2026');
            await db.sequelize.query(`UPDATE orders SET "orderDate" = '01-09-2026' WHERE id = :id`, { replacements: { id: invoice.id } }); // old date-only edit
            // Must be left alone:
            const history = await insertRawPayment({ paymentDate: '04-09-2026' });
            const { batch: reversed } = await post('PAYMENT', history.id, '2026-04-09');
            await db.sequelize.query(`UPDATE journal_batches SET "isReversed" = true WHERE id = :id`, { replacements: { id: reversed.id } });
            const deleted = await insertRawPayment({ paymentDate: '04-09-2026' });
            await post('PAYMENT', deleted.id, '2026-04-09');
            await db.sequelize.query(`UPDATE payments SET "isDeleted" = true WHERE id = :id`, { replacements: { id: deleted.id } });
            const unreadable = await insertRawPayment({ paymentDate: 'someday' });
            await post('PAYMENT', unreadable.id, '2026-09-04');

            const tbBefore = await trialBalance();
            const plan = await planRepair();
            const fixedFor = (id) => plan.fixes.filter((f) => f.batchId && rowsFor(id).includes(f.batchId));
            const batchIdsOf = await q(`SELECT id, "referenceId" FROM journal_batches`);
            const rowsFor = (id) => batchIdsOf.filter((b) => b.referenceId === id).map((b) => b.id);

            expect(fixedFor(swapped.id)).toEqual([expect.objectContaining({ journalDate: '2026-04-09', correctDate: '2026-09-04' })]);
            expect(fixedFor(entryDay.id)).toEqual([expect.objectContaining({ journalDate: '2026-10-01', correctDate: '2026-09-25' })]);
            expect(fixedFor(invoice.id).map((f) => [f.referenceType, f.correctDate]).sort())
                .toEqual([['INVOICE', '2026-09-01'], ['INVOICE_CASH', '2026-09-01']]);
            expect(fixedFor(history.id)).toEqual([]);
            expect(plan.skipped.deletedDocument.map((r) => r.batchId)).toEqual(expect.arrayContaining(rowsFor(deleted.id)));
            expect(plan.skipped.unreadableDate.map((r) => r.batchId)).toEqual(expect.arrayContaining(rowsFor(unreadable.id)));

            const result = await applyRepair(plan);
            expect(result.batches).toBe(plan.fixes.length);

            expect((await batchDates(swapped.id))[0].d).toBe('2026-09-04');
            expect(await lineDates(swapped.id)).toEqual(['2026-09-04', '2026-09-04']);
            expect((await batchDates(entryDay.id))[0].d).toBe('2026-09-25');
            expect(new Set((await batchDates(invoice.id)).filter((b) => !b.isReversed).map((b) => b.d))).toEqual(new Set(['2026-09-01']));
            expect((await batchDates(history.id))[0]).toMatchObject({ isReversed: true, d: '2026-04-09' });
            expect((await batchDates(deleted.id))[0].d).toBe('2026-04-09');
            expect(await trialBalance()).toEqual(tbBefore); // only days moved, never amounts

            const [log] = await q(`SELECT description FROM audit_logs WHERE "entityType" = 'JOURNAL_BATCH' ORDER BY "createdAt" DESC LIMIT 1`);
            expect(log.description).toMatch(new RegExp(`Repaired the date of ${result.batches} journal batches`));

            expect((await planRepair()).fixes).toEqual([]); // a second run has nothing to do
        });

        test('the repair refuses to write a stale date over a change made after its report', async () => {
            const { planRepair, applyRepair } = require('../../../scripts/repair-journal-dates');
            const LedgerService = require('../../services/ledgerService');
            const [a1, a2] = await q(`SELECT id FROM accounts ORDER BY code LIMIT 2`);
            const wrong = async (paymentDate, journalDate) => {
                const p = await insertRawPayment({ paymentDate });
                await new LedgerService(db).createJournalBatch({
                    referenceType: 'PAYMENT', referenceId: p.id, transactionDate: journalDate, description: 'seed',
                    entries: [{ accountId: a1.id, debit: 10, credit: 0 }, { accountId: a2.id, debit: 0, credit: 10 }],
                });
                return p;
            };
            const movedMeanwhile = await wrong('04-09-2026', '2026-04-09');
            const untouched = await wrong('11-09-2026', '2026-11-09');

            const plan = await planRepair();
            expect(plan.fixes.length).toBeGreaterThanOrEqual(2);
            // An admin changes one of them in the app after the report was printed.
            await changeDocumentDate({ kind: 'payment', id: movedMeanwhile.id, newDate: '2026-09-02', user: admin });

            await expect(applyRepair(plan)).rejects.toThrow(/changed since the report was made.*nothing changed/s);
            expect((await batchDates(movedMeanwhile.id))[0].d).toBe('2026-09-02'); // the app's change stands
            expect((await batchDates(untouched.id))[0].d).toBe('2026-11-09');      // rolled back as a whole

            // Running again plans from the current state and succeeds.
            await applyRepair(await planRepair());
            expect((await batchDates(untouched.id))[0].d).toBe('2026-09-11');
            expect((await batchDates(movedMeanwhile.id))[0].d).toBe('2026-09-02');
        });
    });

    test('all or nothing: if any step fails, the document, journal and audit are untouched', async () => {
        const pur = await insertPurchase('02-09-2026', 5000);
        const spy = jest.spyOn(db.stockTransaction, 'update').mockRejectedValueOnce(new Error('disk full'));
        try {
            await expect(changeDocumentDate({ kind: 'purchase', id: pur.id, newDate: '2026-09-07', user: admin }))
                .rejects.toThrow('disk full');
        } finally {
            spy.mockRestore();
        }
        expect((await db.purchaseBill.findByPk(pur.id)).billDate).toBe('02-09-2026');
        expect((await batchDates(pur.id))[0].d).toBe('2026-09-02');
        expect(await auditCount(pur.id)).toBe(0);
    });
});
