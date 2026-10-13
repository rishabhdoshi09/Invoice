/**
 * Tests for the real fetchWeightsAction polling loop. Only the HTTP call is
 * faked: each poll is served the next scripted /api/weights response.
 *
 * Run: CI=true npx react-scripts test --watchAll=false --testPathPattern=fetchWeights
 */
import { fetchWeightsAction } from './orders';
import { fetchWeights } from '../services/order';

jest.mock('../services/order', () => ({
    fetchWeights: jest.fn(),
    createOrder: jest.fn(),
    listOrders: jest.fn(),
    deleteOrder: jest.fn(),
    getOrder: jest.fn(),
}));
jest.mock('./api', () => ({ api: { util: { invalidateTags: jest.fn() } } }));

const reading = (over) => ({
    weight: 0, isStable: false, isConnected: true, devicePresent: true,
    connectionStatus: 'connected', itemEpoch: 5, ...over,
});

// One scripted response per poll; the last one repeats.
function script(responses) {
    let i = 0;
    fetchWeights.mockImplementation(async () => ({ data: { data: responses[Math.min(i++, responses.length - 1)] } }));
}

async function press() {
    const toasts = [];
    // Runs thunks like redux-thunk; setNotification/startLoading are thunks.
    const dispatch = (a) => {
        if (typeof a === 'function') return a(dispatch);
        if (a && a.payload && a.payload.message) toasts.push(a.payload.message);
        return a;
    };
    const data = await fetchWeightsAction()(dispatch);
    return { data, toasts, polls: fetchWeights.mock.calls.length };
}

beforeEach(() => fetchWeights.mockReset());

test("REGRESSION: lifting B and placing C mid-wait never bills C on B's line", async () => {
    script([
        reading({ weight: 1.27 }),                                   // '=' pressed while B bounces
        reading({ weight: 1.2 }),
        reading({ weight: 0, itemEpoch: 6 }),                        // B lifted: pan emptied
        reading({ weight: 1.85, itemEpoch: 6 }),                     // C placed
        reading({ weight: 1.85, isStable: true, itemEpoch: 6 }),     // C settles
    ]);
    const { data, toasts } = await press();
    expect(data.isStable).toBe(false); // every consumer refuses to fill
    expect(toasts.pop()).toMatch(/item on the scale changed/);
});

test('the item that was on the pan at the press is filled once it settles', async () => {
    script([
        reading({ weight: 1.27 }),
        reading({ weight: 1.21 }),
        reading({ weight: 1.2, isStable: true }),
    ]);
    const { data, toasts } = await press();
    expect(data).toMatchObject({ weight: 1.2, isStable: true });
    expect(toasts.pop()).toBe('Weight fetched successfully');
});

test('pressing on an empty pan waits for the item to land', async () => {
    script([
        reading({ weight: 0, isStable: true }),                      // pan already empty
        reading({ weight: 0.9 }),                                    // item lands
        reading({ weight: 1.5, isStable: true }),
    ]);
    const { data } = await press();
    expect(data).toMatchObject({ weight: 1.5, isStable: true });
});

test('a scale reconnect during the wait voids the press', async () => {
    script([
        reading({ weight: 1.27 }),
        reading({ weight: 0, isConnected: false, connectionStatus: 'disconnected', itemEpoch: 6 }),
        reading({ weight: 2.0, isStable: true, itemEpoch: 6 }),
    ]);
    const { data } = await press();
    expect(data.isStable).toBe(false);
});

test('an unplugged scale fails at once, with one request', async () => {
    script([reading({ isConnected: false, devicePresent: false, connectionStatus: 'disconnected' })]);
    const { data, polls, toasts } = await press();
    expect(polls).toBe(1);
    expect(data.isConnected).toBe(false);
    expect(toasts.pop()).toMatch(/cannot see the scale/);
});

test('a weight that never settles gives up after ~2 s and at most 10 requests', async () => {
    script([reading({ weight: 1.3 })]);
    const startedAt = Date.now();
    const { data, polls } = await press();
    expect(data.isStable).toBe(false);
    expect(polls).toBeLessThanOrEqual(10);
    expect(Date.now() - startedAt).toBeLessThan(2600);
});
