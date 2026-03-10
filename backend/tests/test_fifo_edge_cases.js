#!/usr/bin/env node
/**
 * Comprehensive edge case tests for FIFO advance consumption
 * Tests the double-entry accounting ledger fixes
 */

const API_URL = process.env.API_URL;
const TOKEN = process.env.TOKEN;

if (!API_URL || !TOKEN) {
    console.error('Missing required environment variables: API_URL and TOKEN');
    process.exit(1);
}

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${TOKEN}`
};

async function api(method, path, body = null) {
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_URL}${path}`, opts);
    return res.json();
}

// Test utilities
let testResults = { passed: 0, failed: 0, tests: [] };

function assertEqual(actual, expected, description) {
    const pass = Math.abs(actual - expected) < 0.01;
    const status = pass ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}: ${description}`);
    console.log(`          expected: ${expected}, got: ${actual}`);
    testResults.tests.push({ description, expected, actual, pass });
    if (pass) testResults.passed++; else testResults.failed++;
    return pass;
}

function assertStringEqual(actual, expected, description) {
    const pass = actual === expected;
    const status = pass ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}: ${description}`);
    console.log(`          expected: ${expected}, got: ${actual}`);
    testResults.tests.push({ description, expected, actual, pass });
    if (pass) testResults.passed++; else testResults.failed++;
    return pass;
}

// Helper functions
async function createCustomer(name, openingBalance = 0) {
    const res = await api('POST', '/api/customers', { 
        name, 
        openingBalance, 
        mobile: `99${Date.now().toString().slice(-8)}` 
    });
    if (res.status !== 200) throw new Error(`Failed to create customer ${name}: ${JSON.stringify(res)}`);
    return res.data;
}

async function createAdvancePayment(customerId, customerName, amount) {
    const res = await api('POST', '/api/payments', {
        partyId: customerId,
        partyName: customerName,
        partyType: 'customer',
        amount,
        referenceType: 'advance',
        paymentDate: new Date().toISOString().split('T')[0],
        notes: 'Test advance payment'
    });
    if (res.status !== 200) throw new Error(`Failed to create advance: ${JSON.stringify(res)}`);
    return res.data;
}

async function createOrder(customerName, total, paidAmount = 0) {
    const res = await api('POST', '/api/orders', {
        customerName,
        orderDate: new Date().toISOString().split('T')[0],
        total,
        subTotal: total,
        tax: 0,
        taxPercent: 0,
        paidAmount,
        orderItems: [{
            name: 'Test Item',
            quantity: 1,
            productPrice: total,
            totalPrice: total,
            type: 'non-weighted'
        }]
    });
    if (res.status !== 200) throw new Error(`Failed to create order: ${JSON.stringify(res)}`);
    return res.data;
}

async function createPaymentForCustomer(customerId, customerName, amount, notes = 'Test payment') {
    // Payment without specific order reference - uses 'advance' referenceType
    // The controller handles FIFO allocation to unpaid orders via customerName matching
    const res = await api('POST', '/api/payments', {
        partyId: customerId,
        partyName: customerName,
        partyType: 'customer',
        amount,
        referenceType: 'advance', // Required field - controller will FIFO allocate
        paymentDate: new Date().toISOString().split('T')[0],
        notes
    });
    if (res.status !== 200) throw new Error(`Failed to create payment: ${JSON.stringify(res)}`);
    return res.data;
}

async function getCustomerWithTransactions(customerId) {
    const res = await api('GET', `/api/customers/${customerId}/transactions`);
    if (res.status !== 200) throw new Error(`Failed to get customer: ${JSON.stringify(res)}`);
    return res.data;
}

async function getCustomersWithBalance() {
    const res = await api('GET', '/api/customers/with-balance');
    if (res.status !== 200) throw new Error(`Failed to get customers list: ${JSON.stringify(res)}`);
    return res.data;
}

async function runTests() {
    console.log('='.repeat(60));
    console.log('FIFO ADVANCE CONSUMPTION EDGE CASE TESTS');
    console.log('='.repeat(60));

    // ===== TEST 1: Order creation with no advance (should work normally) =====
    console.log('\n--- TEST 1: Credit order without any advance ---');
    try {
        const cust1 = await createCustomer('FIFO_NoAdvance_' + Date.now());
        const order1 = await createOrder(cust1.name, 5000, 0);
        const txn1 = await getCustomerWithTransactions(cust1.id);
        
        assertStringEqual(order1.paymentStatus, 'unpaid', 'Credit order should be unpaid');
        assertEqual(order1.dueAmount, 5000, 'Due amount should be full total');
        assertEqual(txn1.balance, 5000, 'Customer balance should equal due amount');
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}`);
        testResults.failed++;
    }

    // ===== TEST 2: Cash sale (fully paid at creation) should NOT consume advances =====
    console.log('\n--- TEST 2: Cash sale should NOT consume advances ---');
    try {
        const cust2 = await createCustomer('FIFO_CashSale_' + Date.now());
        // Create advance first
        await createAdvancePayment(cust2.id, cust2.name, 1000);
        // Create fully paid cash sale
        const order2 = await createOrder(cust2.name, 2000, 2000);
        const txn2 = await getCustomerWithTransactions(cust2.id);
        
        assertStringEqual(order2.paymentStatus, 'paid', 'Cash sale should be paid');
        assertEqual(order2.paidAmount, 2000, 'Cash sale paidAmount should be 2000 (not increased by advance)');
        // Advance should still be standalone (not consumed)
        const standaloneAdvances = txn2.payments.filter(p => p.referenceType === 'advance');
        assertEqual(standaloneAdvances.length, 1, 'Advance should remain as standalone');
        assertEqual(standaloneAdvances[0].amount, 1000, 'Advance amount should be unchanged');
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}`);
        testResults.failed++;
    }

    // ===== TEST 3: Partial advance consumption =====
    console.log('\n--- TEST 3: Partial advance consumption (advance < order due) ---');
    try {
        const cust3 = await createCustomer('FIFO_Partial_' + Date.now());
        // Create advance of 2000
        await createAdvancePayment(cust3.id, cust3.name, 2000);
        // Create credit order for 5000
        const order3 = await createOrder(cust3.name, 5000, 0);
        const txn3 = await getCustomerWithTransactions(cust3.id);
        
        assertStringEqual(order3.paymentStatus, 'partial', 'Order should be partially paid');
        assertEqual(order3.paidAmount, 2000, 'Order paidAmount should be 2000 (advance consumed)');
        assertEqual(order3.dueAmount, 3000, 'Due amount should be 3000');
        assertEqual(txn3.balance, 3000, 'Customer balance should be 3000');
        // Advance should now be linked to order
        const linkedPayments = txn3.payments.filter(p => p.referenceType === 'order');
        assertEqual(linkedPayments.length, 1, 'Advance should be linked to order');
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}`);
        testResults.failed++;
    }

    // ===== TEST 4: Full advance consumption =====
    console.log('\n--- TEST 4: Full advance consumption (advance >= order due) ---');
    try {
        const cust4 = await createCustomer('FIFO_Full_' + Date.now());
        // Create advance of 5000
        await createAdvancePayment(cust4.id, cust4.name, 5000);
        // Create credit order for 3000
        const order4 = await createOrder(cust4.name, 3000, 0);
        const txn4 = await getCustomerWithTransactions(cust4.id);
        
        assertStringEqual(order4.paymentStatus, 'paid', 'Order should be fully paid');
        assertEqual(order4.paidAmount, 3000, 'Order paidAmount should equal total');
        assertEqual(order4.dueAmount, 0, 'Due amount should be 0');
        // Remaining advance should be 2000 (5000 - 3000)
        const remainingAdvances = txn4.payments.filter(p => p.referenceType === 'advance');
        const remainingTotal = remainingAdvances.reduce((sum, p) => sum + p.amount, 0);
        assertEqual(remainingTotal, 2000, 'Remaining advance should be 2000');
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}`);
        testResults.failed++;
    }

    // ===== TEST 5: Advance splitting =====
    console.log('\n--- TEST 5: Advance splitting (advance > remaining due) ---');
    try {
        const cust5 = await createCustomer('FIFO_Split_' + Date.now());
        // Create one advance of 3000
        const adv = await createAdvancePayment(cust5.id, cust5.name, 3000);
        console.log(`    Created advance: ${adv.paymentNumber}, amount: ${adv.amount}`);
        // Create credit order for 1500
        const order5 = await createOrder(cust5.name, 1500, 0);
        const txn5 = await getCustomerWithTransactions(cust5.id);
        
        assertStringEqual(order5.paymentStatus, 'paid', 'Order should be fully paid');
        assertEqual(order5.paidAmount, 1500, 'Order paidAmount should be 1500');
        
        // Check remaining advance (should be 1500)
        const remainingAdvances = txn5.payments.filter(p => p.referenceType === 'advance');
        const remainingTotal = remainingAdvances.reduce((sum, p) => sum + p.amount, 0);
        assertEqual(remainingTotal, 1500, 'Remaining advance should be 1500 after split');
        
        // Check linked payment (should be 1500)
        const linkedPayments = txn5.payments.filter(p => p.referenceType === 'order');
        const linkedTotal = linkedPayments.reduce((sum, p) => sum + p.amount, 0);
        assertEqual(linkedTotal, 1500, 'Linked payment should be 1500');
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}`);
        testResults.failed++;
    }

    // ===== TEST 6: Multiple advances consumed FIFO (oldest first) =====
    console.log('\n--- TEST 6: Multiple advances FIFO (oldest consumed first) ---');
    try {
        const cust6 = await createCustomer('FIFO_Multi_' + Date.now());
        // Create two advances
        const adv1 = await createAdvancePayment(cust6.id, cust6.name, 1000);
        await new Promise(r => setTimeout(r, 100)); // Small delay to ensure ordering
        const adv2 = await createAdvancePayment(cust6.id, cust6.name, 2000);
        console.log(`    Advance 1: ${adv1.paymentNumber} = 1000`);
        console.log(`    Advance 2: ${adv2.paymentNumber} = 2000`);
        
        // Create order for 2500 (should consume first advance fully, second partially)
        const order6 = await createOrder(cust6.name, 2500, 0);
        const txn6 = await getCustomerWithTransactions(cust6.id);
        
        assertStringEqual(order6.paymentStatus, 'paid', 'Order should be fully paid');
        assertEqual(order6.paidAmount, 2500, 'Order paidAmount should be 2500');
        
        // Remaining advance: 3000 - 2500 = 500
        const remainingAdvances = txn6.payments.filter(p => p.referenceType === 'advance');
        const remainingTotal = remainingAdvances.reduce((sum, p) => sum + p.amount, 0);
        assertEqual(remainingTotal, 500, 'Remaining advance should be 500');
        assertEqual(txn6.balance, 0, 'Customer balance should be 0');
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}`);
        testResults.failed++;
    }

    // ===== TEST 7: Opening balance + advance + credit order =====
    console.log('\n--- TEST 7: Opening balance + advance + credit order ---');
    try {
        const cust7 = await createCustomer('FIFO_Opening_' + Date.now(), 5000);
        // Create advance
        await createAdvancePayment(cust7.id, cust7.name, 3000);
        // Create credit order for 4000
        const order7 = await createOrder(cust7.name, 4000, 0);
        const txn7 = await getCustomerWithTransactions(cust7.id);
        
        console.log(`    Opening: 5000, Advance: 3000, Order: 4000`);
        console.log(`    Order paidAmount: ${order7.paidAmount}, dueAmount: ${order7.dueAmount}`);
        
        // Advance (3000) consumed by order (4000) -> order has due 1000
        assertEqual(order7.paidAmount, 3000, 'Order paidAmount should be 3000');
        assertEqual(order7.dueAmount, 1000, 'Order dueAmount should be 1000');
        
        // Balance = opening (5000) + remaining order due (1000) = 6000
        // No standalone advances left (all consumed by order)
        assertEqual(txn7.balance, 6000, 'Balance = opening + remaining due = 6000');
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}`);
        testResults.failed++;
    }

    // ===== TEST 8: Payment FIFO to unpaid orders =====
    console.log('\n--- TEST 8: Payment allocation FIFO to oldest unpaid order ---');
    try {
        const cust8 = await createCustomer('FIFO_Payment_' + Date.now());
        // Create two credit orders
        const order8a = await createOrder(cust8.name, 1000, 0);
        await new Promise(r => setTimeout(r, 100)); // Small delay
        const order8b = await createOrder(cust8.name, 2000, 0);
        console.log(`    Order A: ${order8a.orderNumber} = 1000`);
        console.log(`    Order B: ${order8b.orderNumber} = 2000`);
        
        // Make a payment of 1500 (should pay order A fully, order B partially)
        await createPaymentForCustomer(cust8.id, cust8.name, 1500);
        
        // Refresh order statuses
        const txn8 = await getCustomerWithTransactions(cust8.id);
        const orderA = txn8.orders.find(o => o.orderNumber === order8a.orderNumber);
        const orderB = txn8.orders.find(o => o.orderNumber === order8b.orderNumber);
        
        console.log(`    After payment: OrderA paid=${orderA?.paidAmount}, OrderB paid=${orderB?.paidAmount}`);
        
        assertEqual(orderA?.paidAmount || 0, 1000, 'Order A should be fully paid');
        assertEqual(orderB?.paidAmount || 0, 500, 'Order B should have 500 paid');
        assertEqual(txn8.balance, 1500, 'Balance should be 1500 (3000 - 1500)');
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}`);
        testResults.failed++;
    }

    // ===== TEST 9: Customer balance list SQL matches JS calculation =====
    console.log('\n--- TEST 9: listCustomersWithBalance SQL matches getCustomerWithTransactions JS ---');
    try {
        const cust9 = await createCustomer('FIFO_SQLMatch_' + Date.now(), 1000);
        await createAdvancePayment(cust9.id, cust9.name, 500);
        await createOrder(cust9.name, 3000, 0);
        
        const txn9 = await getCustomerWithTransactions(cust9.id);
        const allCustomers = await getCustomersWithBalance();
        const cust9InList = allCustomers.rows.find(c => c.id === cust9.id);
        
        console.log(`    JS balance: ${txn9.balance}, SQL balance: ${cust9InList?.balance}`);
        
        assertEqual(Number(cust9InList?.balance || 0), txn9.balance, 'SQL balance should match JS balance');
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}`);
        testResults.failed++;
    }

    // ===== TEST 10: Zero advance edge case =====
    console.log('\n--- TEST 10: Zero advance amount (edge case) ---');
    try {
        const cust10 = await createCustomer('FIFO_Zero_' + Date.now());
        // Create order without any advance
        const order10 = await createOrder(cust10.name, 500, 0);
        // Then make a payment for exact order amount
        await createPaymentForCustomer(cust10.id, cust10.name, 500);
        
        const txn10 = await getCustomerWithTransactions(cust10.id);
        const order = txn10.orders[0];
        
        assertEqual(order?.paidAmount || 0, 500, 'Order should be fully paid');
        assertEqual(txn10.balance, 0, 'Balance should be 0');
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}`);
        testResults.failed++;
    }

    // ===== TEST 11: Large advance exceeding all orders =====
    console.log('\n--- TEST 11: Large advance exceeding total order value ---');
    try {
        const cust11 = await createCustomer('FIFO_Large_' + Date.now());
        // Create a large advance
        await createAdvancePayment(cust11.id, cust11.name, 10000);
        // Create a small order
        const order11 = await createOrder(cust11.name, 2000, 0);
        const txn11 = await getCustomerWithTransactions(cust11.id);
        
        assertStringEqual(order11.paymentStatus, 'paid', 'Order should be paid');
        assertEqual(order11.paidAmount, 2000, 'Order paidAmount should be 2000');
        
        // Remaining advance = 10000 - 2000 = 8000
        const remainingAdvances = txn11.payments.filter(p => p.referenceType === 'advance');
        const remainingTotal = remainingAdvances.reduce((sum, p) => sum + p.amount, 0);
        assertEqual(remainingTotal, 8000, 'Remaining advance should be 8000');
        
        // Balance should be 0 (order paid, remaining advance is customer's credit)
        assertEqual(txn11.balance, 0, 'Balance should be 0');
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}`);
        testResults.failed++;
    }

    // ===== TEST 12: Multiple orders after single advance =====
    console.log('\n--- TEST 12: Multiple orders consuming same advance sequentially ---');
    try {
        const cust12 = await createCustomer('FIFO_MultiOrder_' + Date.now());
        // Create advance
        await createAdvancePayment(cust12.id, cust12.name, 5000);
        
        // Create first order
        const order12a = await createOrder(cust12.name, 2000, 0);
        console.log(`    Order 1: paid=${order12a.paidAmount}, due=${order12a.dueAmount}`);
        
        // Create second order
        const order12b = await createOrder(cust12.name, 2500, 0);
        console.log(`    Order 2: paid=${order12b.paidAmount}, due=${order12b.dueAmount}`);
        
        // Create third order
        const order12c = await createOrder(cust12.name, 1000, 0);
        console.log(`    Order 3: paid=${order12c.paidAmount}, due=${order12c.dueAmount}`);
        
        const txn12 = await getCustomerWithTransactions(cust12.id);
        
        // Advance 5000:
        // Order1: 2000 consumed, remaining 3000
        // Order2: 2500 consumed, remaining 500
        // Order3: 500 consumed, remaining 0
        
        assertEqual(order12a.paidAmount, 2000, 'Order 1 should be fully paid');
        assertEqual(order12b.paidAmount, 2500, 'Order 2 should be fully paid');
        assertEqual(order12c.paidAmount, 500, 'Order 3 should have 500 paid');
        assertEqual(txn12.balance, 500, 'Balance should be 500 (Order3 remaining)');
    } catch (e) {
        console.log(`  ✗ FAIL: ${e.message}`);
        testResults.failed++;
    }

    // ===== Summary =====
    console.log('\n' + '='.repeat(60));
    console.log(`RESULTS: ${testResults.passed} passed, ${testResults.failed} failed`);
    console.log('='.repeat(60) + '\n');
    
    process.exit(testResults.failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
});
