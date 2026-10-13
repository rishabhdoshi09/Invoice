/**
 * The API rate limit must never be exhausted by scale polling: a burst of
 * weight reads (an operator retrying '/' during a USB drop-out) previously used
 * up the shared 300/min budget, and the next request to save the bill got 429.
 *
 * Run: npm test -- --testPathPattern=rateLimits
 */

const express = require('express');
const request = require('supertest');

function makeApp() {
    let apiLimiter;
    jest.isolateModules(() => { ({ apiLimiter } = require('../../middleware/rateLimits')); });
    const app = express();
    app.use('/api', apiLimiter);
    app.get('/api/weights', (req, res) => res.send({ ok: true }));
    app.post('/api/orders', (req, res) => res.send({ ok: true }));
    return app;
}

async function hit(app, n, send) {
    const statuses = [];
    for (let i = 0; i < n; i++) statuses.push((await send(request(app))).status);
    return statuses;
}

test('weight polling never uses up the budget, so saving the bill still works', async () => {
    const app = makeApp();
    const polls = await hit(app, 400, (r) => r.get('/api/weights?_t=1'));
    expect(polls.filter((s) => s === 429)).toHaveLength(0);

    const save = await request(app).post('/api/orders').send({});
    expect(save.status).toBe(200);
});

test('every other API route is still limited at 300 per minute', async () => {
    const app = makeApp();
    const statuses = await hit(app, 301, (r) => r.post('/api/orders').send({}));
    expect(statuses.slice(0, 300).every((s) => s === 200)).toBe(true);
    expect(statuses[300]).toBe(429);
});
