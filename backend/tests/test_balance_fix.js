#!/usr/bin/env node
/**
 * Comprehensive test for customer balance calculation fix
 * Tests the FIFO advance consumption and balance formula
 */

const API_URL = process.env.API_URL;
const TOKEN = process.env.TOKEN;

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

async function createCustomer(name, openingBalance = 0) {
    const res = await api('POST', '/api/customers', { name, openingBalance, mobile: `99${Date.now().toString().slice(-8)}` });
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
        notes: 'Test advance'
    });
    if (res.status !== 200) throw new Error(`Failed to create payment: ${JSON.stringify(res)}`);
    return res.data;
}

async function createOrder(customerName, customerId, total, paidAmount = 0) {
    const dueAmount = total - paidAmount;
    const res = await api('POST', '/api/orders', {
        customerName,
        customerMobile: '',
        orderDate: new Date().toISOString().split('T')[0],
        total,
        subTotal: total,
        tax: 0,
        taxPercent: 0,
        paidAmount: paidAmount,
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

async function getCustomerWithTransactions(customerId) {
    const res = await api('GET', `/api/customers/${customerId}/transactions`);
    if (res.status !== 200) throw new Error(`Failed to get customer: ${JSON.stringify(res)}`);
    return res.data;
}

async function getCustomersWithBalance() {
    const res = await api('GET', '/api/customers/with-balance');
    if (res.status !== 200) throw new Error(`Failed to get customers: ${JSON.stringify(res)}`);
    return res.data;
}

function assertEqual(actual, expected, description) {
    const pass = Math.abs(actual - expected) < 0.01;
    const status = pass ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}: ${description} (expected: ${expected}, got: ${actual})`);
    return pass;
}

async function runTests() {
    let passed = 0;
    let failed = 0;
    
    function check(result) {
        if (result) passed++; else failed++;
    }

    // ===== SCENARIO 1: Cash sale (no advance, fully paid) =====
    console.log('\n--- Scenario 1: Cash sale (no advance, fully paid) ---');
    const cust1 = await createCustomer('TestCustomer_CashSale');
    await createOrder('TestCustomer_CashSale', cust1.id, 1000, 1000);
    const txn1 = await getCustomerWithTransactions(cust1.id);
    check(assertEqual(txn1.balance, 0, 'Cash sale: balance should be 0'));

    // ===== SCENARIO 2: Credit sale (no advance, unpaid) =====
    console.log('\n--- Scenario 2: Credit sale (no advance, unpaid) ---');
    const cust2 = await createCustomer('TestCustomer_CreditSale');
    await createOrder('TestCustomer_CreditSale', cust2.id, 2000, 0);
    const txn2 = await getCustomerWithTransactions(cust2.id);
    check(assertEqual(txn2.balance, 2000, 'Credit sale: balance should be 2000'));

    // ===== SCENARIO 3: Advance THEN credit order (FIFO should consume) =====
    console.log('\n--- Scenario 3: Advance payment THEN credit order (FIFO) ---');
    const cust3 = await createCustomer('TestCustomer_AdvanceThenOrder');
    await createAdvancePayment(cust3.id, 'TestCustomer_AdvanceThenOrder', 3000);
    // Now create a credit order for 3000
    const order3 = await createOrder('TestCustomer_AdvanceThenOrder', cust3.id, 3000, 0);
    // The FIFO should have consumed the advance: order should now be paid
    const txn3 = await getCustomerWithTransactions(cust3.id);
    console.log(`  Order status: ${order3.paymentStatus}, paidAmount: ${order3.paidAmount}, dueAmount: ${order3.dueAmount}`);
    check(assertEqual(txn3.balance, 0, 'Advance consumed by order: balance should be 0'));
    // Check the advance was linked to the order
    const linkedPayments = txn3.payments.filter(p => p.referenceType === 'order');
    check(assertEqual(linkedPayments.length, 1, 'Advance should be linked to order'));

    // ===== SCENARIO 4: Partial advance + credit order =====
    console.log('\n--- Scenario 4: Partial advance (2000) THEN larger order (5000) ---');
    const cust4 = await createCustomer('TestCustomer_PartialAdvance');
    await createAdvancePayment(cust4.id, 'TestCustomer_PartialAdvance', 2000);
    const order4 = await createOrder('TestCustomer_PartialAdvance', cust4.id, 5000, 0);
    const txn4 = await getCustomerWithTransactions(cust4.id);
    console.log(`  Order status: ${order4.paymentStatus}, paidAmount: ${order4.paidAmount}, dueAmount: ${order4.dueAmount}`);
    check(assertEqual(txn4.balance, 3000, 'Partial advance: balance should be 3000 (5000-2000)'));

    // ===== SCENARIO 5: Opening balance + advance =====
    console.log('\n--- Scenario 5: Opening balance (5000) + advance (3000), no orders ---');
    const cust5 = await createCustomer('TestCustomer_OpeningAdvance', 5000);
    await createAdvancePayment(cust5.id, 'TestCustomer_OpeningAdvance', 3000);
    const txn5 = await getCustomerWithTransactions(cust5.id);
    check(assertEqual(txn5.balance, 2000, 'Opening 5000 - advance 3000 = balance 2000'));

    // ===== SCENARIO 6: Opening balance + advance + credit order =====
    console.log('\n--- Scenario 6: Opening (5000), advance (3000), then credit order (4000) ---');
    const cust6 = await createCustomer('TestCustomer_Complex', 5000);
    await createAdvancePayment(cust6.id, 'TestCustomer_Complex', 3000);
    // Order with 4000 due - FIFO should consume the 3000 advance
    const order6 = await createOrder('TestCustomer_Complex', cust6.id, 4000, 0);
    const txn6 = await getCustomerWithTransactions(cust6.id);
    console.log(`  Order status: ${order6.paymentStatus}, paidAmount: ${order6.paidAmount}, dueAmount: ${order6.dueAmount}`);
    // Opening: 5000, Order due after FIFO: 1000 (4000 - 3000 consumed)
    // Balance: 5000 + 1000 = 6000
    check(assertEqual(txn6.balance, 6000, 'Opening 5000 + remaining due 1000 = 6000'));

    // ===== SCENARIO 7: Multiple advances consumed FIFO =====
    console.log('\n--- Scenario 7: Two advances (1000, 2000) then order (2500) ---');
    const cust7 = await createCustomer('TestCustomer_MultiFIFO');
    await createAdvancePayment(cust7.id, 'TestCustomer_MultiFIFO', 1000);
    await createAdvancePayment(cust7.id, 'TestCustomer_MultiFIFO', 2000);
    const order7 = await createOrder('TestCustomer_MultiFIFO', cust7.id, 2500, 0);
    const txn7 = await getCustomerWithTransactions(cust7.id);
    console.log(`  Order status: ${order7.paymentStatus}, paidAmount: ${order7.paidAmount}, dueAmount: ${order7.dueAmount}`);
    // First advance (1000) fully consumed, second advance (2000) partially consumed (1500)
    // Remaining advance: 500, Order paid: 2500 → fully paid
    check(assertEqual(txn7.balance, 0, 'All advances consumed: balance should be 0'));
    // Check remaining advance
    const remainingAdvances = txn7.payments.filter(p => p.referenceType === 'advance');
    console.log(`  Remaining advances: ${remainingAdvances.length}, amount: ${remainingAdvances.reduce((s,p) => s + p.amount, 0)}`);
    check(assertEqual(remainingAdvances.reduce((s, p) => s + p.amount, 0), 500, 'Remaining advance should be 500'));

    // ===== SCENARIO 8: Verify listCustomersWithBalance matches =====
    console.log('\n--- Scenario 8: Verify list balance matches transaction balance ---');
    const allCustomers = await getCustomersWithBalance();
    // Find cust6 in the list
    const cust6InList = allCustomers.rows.find(c => c.id === cust6.id);
    if (cust6InList) {
        check(assertEqual(Number(cust6InList.balance), txn6.balance, 'List balance should match transaction balance for Complex customer'));
    } else {
        console.log('  ✗ FAIL: Could not find customer in list');
        failed++;
    }

    // ===== Summary =====
    console.log(`\n========================================`);
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);
    
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
});
