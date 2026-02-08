/**
 * Database Integration Test for Invoice Aggregation
 * 
 * This script:
 * 1. Creates real invoices in the database
 * 2. Validates the dailySummary aggregation against expected totals
 * 3. Tests edge cases (very small decimals, large numbers, etc.)
 * 4. Cleans up test data after validation
 */

const db = require('../src/models');
const Services = require('../src/services');
const uuidv4 = require('uuid/v4');
const moment = require('moment');

const TEST_PREFIX = 'VALIDATION-TEST';
const NUM_INVOICES = 100; // Smaller number for actual DB test

// Deterministic random for reproducibility
let seed = 54321;
function seededRandom() {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

function randomInt(min, max) {
    return Math.floor(seededRandom() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 2) {
    const val = seededRandom() * (max - min) + min;
    return parseFloat(val.toFixed(decimals));
}

function randomChoice(arr) {
    return arr[Math.floor(seededRandom() * arr.length)];
}

// Edge case generators
const EDGE_CASES = [
    // Very small amounts
    { name: 'Small Item', price: 0.01, quantity: 1 },
    { name: 'Tiny Fraction', price: 0.99, quantity: 0.001 },
    // Large amounts
    { name: 'Expensive Item', price: 9999.99, quantity: 1 },
    { name: 'Bulk Order', price: 100, quantity: 999 },
    // Repeating decimals
    { name: 'Repeating Decimal', price: 33.33, quantity: 3 },
    { name: 'Another Repeating', price: 16.67, quantity: 6 },
    // Common problematic values
    { name: 'Point Seven', price: 0.7, quantity: 10 },
    { name: 'Point One', price: 0.1, quantity: 100 },
];

async function createTestInvoice(index, isEdgeCase = false) {
    let items = [];
    let subTotal = 0;
    
    if (isEdgeCase && index < EDGE_CASES.length) {
        // Use edge case data
        const edgeCase = EDGE_CASES[index];
        const lineTotal = parseFloat((edgeCase.price * edgeCase.quantity).toFixed(2));
        items.push({
            productId: uuidv4(),
            name: edgeCase.name,
            type: 'non-weighted',
            quantity: edgeCase.quantity,
            productPrice: edgeCase.price,
            totalPrice: lineTotal
        });
        subTotal = lineTotal;
    } else {
        // Generate random items
        const numItems = randomInt(1, 5);
        for (let i = 0; i < numItems; i++) {
            const price = randomFloat(10, 500);
            const quantity = randomFloat(0.1, 10, 3);
            const lineTotal = parseFloat((price * quantity).toFixed(2));
            
            items.push({
                productId: uuidv4(),
                name: `Test Product ${index}-${i}`,
                type: randomChoice(['weighted', 'non-weighted']),
                quantity: quantity,
                productPrice: price,
                totalPrice: lineTotal
            });
            subTotal += lineTotal;
        }
        subTotal = parseFloat(subTotal.toFixed(2));
    }
    
    const taxPercent = randomChoice([0, 5, 12, 18]);
    const tax = parseFloat((subTotal * (taxPercent / 100)).toFixed(2));
    const total = parseFloat((subTotal + tax).toFixed(2));
    
    const paymentStatus = randomChoice(['paid', 'paid', 'unpaid']);
    const paidAmount = paymentStatus === 'paid' ? total : 0;
    const dueAmount = total - paidAmount;
    
    return {
        orderNumber: `${TEST_PREFIX}/${index.toString().padStart(4, '0')}`,
        orderDate: moment().format('DD-MM-YYYY'),
        customerName: `Validation Test Customer ${index}`,
        customerMobile: `9000000${index.toString().padStart(3, '0')}`,
        subTotal,
        tax,
        taxPercent,
        total,
        paidAmount,
        dueAmount,
        paymentStatus,
        orderItems: items
    };
}

async function runDatabaseValidation() {
    console.log('═'.repeat(80));
    console.log('DATABASE INTEGRATION VALIDATION TEST');
    console.log('═'.repeat(80));
    
    const createdOrderIds = [];
    let expectedTotal = 0;
    let expectedOrders = 0;
    let expectedReceivables = 0;
    
    // Use high-precision tracking
    let preciseTotalPaise = 0;
    
    try {
        // Check database connection
        await db.sequelize.authenticate();
        console.log('✓ Database connected\n');
        
        // Get initial daily summary state
        const initialSummary = await Services.dailySummary.getTodaySummary();
        const initialSales = initialSummary.totalSales || 0;
        const initialOrders = initialSummary.totalOrders || 0;
        console.log(`Initial State: ${initialOrders} orders, ₹${initialSales} total sales\n`);
        
        console.log('─'.repeat(80));
        console.log(`Creating ${NUM_INVOICES} test invoices (including edge cases)...`);
        console.log('─'.repeat(80));
        
        // Create invoices one by one to test aggregation
        for (let i = 0; i < NUM_INVOICES; i++) {
            const isEdgeCase = i < EDGE_CASES.length;
            const invoiceData = await createTestInvoice(i, isEdgeCase);
            
            // Track expected values
            expectedTotal += invoiceData.total;
            preciseTotalPaise += Math.round(invoiceData.total * 100);
            expectedOrders++;
            if (invoiceData.paymentStatus !== 'paid') {
                expectedReceivables += invoiceData.dueAmount;
            }
            
            // Create in database
            const result = await db.sequelize.transaction(async (transaction) => {
                // Generate invoice number
                const invoiceInfo = await Services.invoiceSequence.generateInvoiceNumber(transaction);
                invoiceData.orderNumber = invoiceInfo.invoiceNumber;
                invoiceData.id = uuidv4();
                
                // Create order
                const order = await db.order.create(invoiceData, { transaction });
                
                // Create order items
                const itemsWithOrderId = invoiceData.orderItems.map(item => ({
                    ...item,
                    id: uuidv4(),
                    orderId: order.id
                }));
                await db.orderItem.bulkCreate(itemsWithOrderId, { transaction });
                
                // Record in daily summary
                await Services.dailySummary.recordOrderCreated(order, transaction);
                
                return order;
            });
            
            createdOrderIds.push(result.id);
            
            if ((i + 1) % 20 === 0 || i < EDGE_CASES.length) {
                const tag = isEdgeCase ? ' [EDGE CASE]' : '';
                console.log(`  Created invoice ${i + 1}: ₹${invoiceData.total.toFixed(2)}${tag}`);
            }
        }
        
        console.log(`\n✓ Created ${createdOrderIds.length} invoices\n`);
        
        // Get final daily summary
        console.log('─'.repeat(80));
        console.log('Fetching aggregated totals from database...');
        console.log('─'.repeat(80));
        
        const finalSummary = await Services.dailySummary.getTodaySummary();
        const appTotalSales = (finalSummary.totalSales || 0) - initialSales;
        const appTotalOrders = (finalSummary.totalOrders || 0) - initialOrders;
        const appReceivables = finalSummary.totalReceivables || 0;
        
        // Round expected values
        expectedTotal = parseFloat(expectedTotal.toFixed(2));
        expectedReceivables = parseFloat(expectedReceivables.toFixed(2));
        const preciseExpectedTotal = preciseTotalPaise / 100;
        
        console.log(`\nExpected Values (Independent Calculation):`);
        console.log(`  Total Sales: ₹${expectedTotal.toLocaleString('en-IN')}`);
        console.log(`  Total Orders: ${expectedOrders}`);
        console.log(`  Total Receivables: ₹${expectedReceivables.toLocaleString('en-IN')}`);
        console.log(`  Precise Total (integer math): ₹${preciseExpectedTotal.toLocaleString('en-IN')}`);
        
        console.log(`\nApp Aggregated Values (from dailySummary):`);
        console.log(`  Total Sales: ₹${appTotalSales.toLocaleString('en-IN')}`);
        console.log(`  Total Orders: ${appTotalOrders}`);
        console.log(`  Total Receivables: ₹${appReceivables.toLocaleString('en-IN')}`);
        
        // Calculate differences
        const salesDiff = Math.abs(expectedTotal - appTotalSales);
        const ordersDiff = Math.abs(expectedOrders - appTotalOrders);
        const floatPointDiff = Math.abs(expectedTotal - preciseExpectedTotal);
        
        console.log('\n' + '─'.repeat(80));
        console.log('COMPARISON RESULTS');
        console.log('─'.repeat(80));
        
        console.log(`Sales Difference: ₹${salesDiff.toFixed(6)}`);
        console.log(`Orders Difference: ${ordersDiff}`);
        console.log(`Float-Point Accumulation Error: ₹${floatPointDiff.toFixed(10)}`);
        
        // Validate edge cases specifically
        console.log('\n' + '─'.repeat(80));
        console.log('EDGE CASE VALIDATION');
        console.log('─'.repeat(80));
        
        for (let i = 0; i < Math.min(EDGE_CASES.length, createdOrderIds.length); i++) {
            const order = await db.order.findOne({
                where: { id: createdOrderIds[i] },
                include: [{ model: db.orderItem, as: 'orderItems' }]
            });
            
            if (order && order.orderItems && order.orderItems.length > 0) {
                const item = order.orderItems[0];
                const expectedLineTotal = parseFloat((item.productPrice * item.quantity).toFixed(2));
                const actualLineTotal = item.totalPrice;
                const lineDiff = Math.abs(expectedLineTotal - actualLineTotal);
                
                const status = lineDiff < 0.01 ? '✓' : '✗';
                console.log(`${status} Edge Case "${EDGE_CASES[i].name}": ${item.productPrice} × ${item.quantity} = ${actualLineTotal} (expected: ${expectedLineTotal}, diff: ${lineDiff.toFixed(4)})`);
            }
        }
        
        // Final verdict
        console.log('\n' + '═'.repeat(80));
        console.log('FINAL VERDICT');
        console.log('═'.repeat(80));
        
        const tolerance = 0.01; // 1 paisa tolerance
        const passed = salesDiff <= tolerance && ordersDiff === 0;
        
        if (passed) {
            console.log('\n✅ ALL TESTS PASSED!');
            console.log('   Invoice aggregation logic is accurate within ±₹0.01 tolerance');
        } else {
            console.log('\n❌ TESTS FAILED!');
            if (salesDiff > tolerance) {
                console.log(`   Sales mismatch: Expected ₹${expectedTotal}, Got ₹${appTotalSales}`);
                console.log(`   Difference: ₹${salesDiff.toFixed(6)}`);
            }
            if (ordersDiff !== 0) {
                console.log(`   Orders mismatch: Expected ${expectedOrders}, Got ${appTotalOrders}`);
            }
            
            console.log('\n   ROOT CAUSE ANALYSIS:');
            if (salesDiff > 0 && salesDiff <= 1) {
                console.log('   - Likely floating-point accumulation error');
                console.log('   - Suggested fix: Use integer arithmetic (paise) for aggregation');
            } else if (salesDiff > 1) {
                console.log('   - Possible double-counting or missing records');
                console.log('   - Check dailySummary.recordOrderCreated for race conditions');
            }
        }
        
        return {
            passed,
            expectedTotal,
            actualTotal: appTotalSales,
            difference: salesDiff,
            orderCount: createdOrderIds.length
        };
        
    } catch (error) {
        console.error('\n❌ Test failed with error:', error.message);
        throw error;
    } finally {
        // Cleanup - delete test orders
        console.log('\n' + '─'.repeat(80));
        console.log('CLEANUP');
        console.log('─'.repeat(80));
        
        if (createdOrderIds.length > 0) {
            try {
                // Delete order items first
                await db.orderItem.destroy({
                    where: { orderId: createdOrderIds }
                });
                
                // Delete orders
                await db.order.destroy({
                    where: { id: createdOrderIds }
                });
                
                console.log(`✓ Cleaned up ${createdOrderIds.length} test orders`);
                
                // Note: dailySummary is NOT cleaned up as it would require
                // recalculating the entire day's totals
                console.log('⚠ Daily summary not rolled back (would require full recalculation)');
            } catch (cleanupError) {
                console.error('Cleanup error:', cleanupError.message);
            }
        }
    }
}

// Run the test
runDatabaseValidation()
    .then(results => {
        console.log('\n' + '═'.repeat(80));
        console.log('TEST SUMMARY');
        console.log('═'.repeat(80));
        console.log(JSON.stringify(results, null, 2));
        process.exit(results.passed ? 0 : 1);
    })
    .catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
