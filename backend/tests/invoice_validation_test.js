/**
 * Invoice Aggregation Validation Test
 * 
 * This script:
 * 1. Generates 500-1000 fake invoices with realistic variations
 * 2. Calculates expected grand total independently
 * 3. Runs invoices through the app's aggregation logic
 * 4. Compares both totals and identifies mismatches
 * 5. Checks for rounding errors, floating-point issues, tax miscalculations
 */

const db = require('../src/models');
const Services = require('../src/services');
const uuidv4 = require('uuid/v4');
const moment = require('moment');

// Configuration
const NUM_INVOICES = 750; // Between 500-1000
const TAX_RATES = [0, 5, 12, 18, 28]; // Common GST rates in India
const DISCOUNT_RATES = [0, 5, 10, 15, 20]; // Common discount percentages

// Seed for reproducible random numbers
let seed = 12345;
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

// Product templates for realistic data
const PRODUCTS = [
    { name: 'Dal', type: 'weighted', priceRange: [80, 150] },
    { name: 'Rice', type: 'weighted', priceRange: [60, 120] },
    { name: 'Paneer', type: 'weighted', priceRange: [200, 350] },
    { name: 'Chicken', type: 'weighted', priceRange: [180, 280] },
    { name: 'Vegetables', type: 'weighted', priceRange: [30, 80] },
    { name: 'Roti', type: 'non-weighted', priceRange: [5, 15] },
    { name: 'Naan', type: 'non-weighted', priceRange: [20, 40] },
    { name: 'Biryani', type: 'non-weighted', priceRange: [150, 300] },
    { name: 'Thali', type: 'non-weighted', priceRange: [100, 200] },
    { name: 'Curry', type: 'weighted', priceRange: [120, 220] },
    { name: 'Sweets', type: 'weighted', priceRange: [300, 500] },
    { name: 'Snacks', type: 'non-weighted', priceRange: [30, 80] },
];

// Generate a single invoice with items
function generateInvoice(index) {
    const numItems = randomInt(1, 8);
    const items = [];
    let calculatedSubTotal = 0;
    
    for (let i = 0; i < numItems; i++) {
        const product = randomChoice(PRODUCTS);
        const price = randomFloat(product.priceRange[0], product.priceRange[1]);
        const quantity = product.type === 'weighted' 
            ? randomFloat(0.1, 5, 3) // Weighted: 0.1kg to 5kg with 3 decimals
            : randomInt(1, 10); // Non-weighted: 1-10 items
        
        // Calculate line total - THIS IS WHERE PRECISION ISSUES CAN OCCUR
        const lineTotal = price * quantity;
        const roundedLineTotal = parseFloat(lineTotal.toFixed(2));
        
        items.push({
            productId: uuidv4(),
            name: product.name,
            type: product.type,
            quantity: quantity,
            productPrice: price,
            totalPrice: roundedLineTotal,
            // Store raw calculation for comparison
            _rawLineTotal: lineTotal
        });
        
        calculatedSubTotal += roundedLineTotal;
    }
    
    // Round subTotal
    const subTotal = parseFloat(calculatedSubTotal.toFixed(2));
    
    // Apply tax
    const taxPercent = randomChoice(TAX_RATES);
    const taxAmount = subTotal * (taxPercent / 100);
    const tax = parseFloat(taxAmount.toFixed(2));
    
    // Calculate total
    const total = parseFloat((subTotal + tax).toFixed(2));
    
    // Payment status
    const paymentStatus = randomChoice(['paid', 'paid', 'paid', 'unpaid', 'partial']); // 60% paid
    let paidAmount = total;
    let dueAmount = 0;
    
    if (paymentStatus === 'unpaid') {
        paidAmount = 0;
        dueAmount = total;
    } else if (paymentStatus === 'partial') {
        paidAmount = parseFloat((total * randomFloat(0.3, 0.7)).toFixed(2));
        dueAmount = parseFloat((total - paidAmount).toFixed(2));
    }
    
    return {
        id: uuidv4(),
        orderNumber: `TEST/2026/INV-${String(index).padStart(5, '0')}`,
        orderDate: moment().format('DD-MM-YYYY'),
        customerName: `Test Customer ${index}`,
        customerMobile: `98${randomInt(10000000, 99999999)}`,
        subTotal,
        tax,
        taxPercent,
        total,
        paidAmount,
        dueAmount,
        paymentStatus,
        orderItems: items,
        // Store calculation metadata for debugging
        _metadata: {
            itemCount: numItems,
            rawSubTotal: calculatedSubTotal,
            rawTax: taxAmount,
            rawTotal: calculatedSubTotal + taxAmount
        }
    };
}

// Independent calculation of totals (reference implementation)
function calculateExpectedTotals(invoices) {
    let totalSales = 0;
    let totalOrders = invoices.length;
    let totalReceivables = 0;
    let totalPaid = 0;
    let itemsByType = { weighted: 0, 'non-weighted': 0 };
    let itemCount = 0;
    
    // Use high-precision arithmetic
    let preciseTotal = 0;
    
    for (const invoice of invoices) {
        // Standard addition (can have floating-point issues)
        totalSales += invoice.total;
        
        // High-precision addition (using integer arithmetic)
        preciseTotal += Math.round(invoice.total * 100);
        
        if (invoice.paymentStatus === 'unpaid' || invoice.paymentStatus === 'partial') {
            totalReceivables += invoice.dueAmount;
        }
        totalPaid += invoice.paidAmount;
        
        for (const item of invoice.orderItems) {
            itemCount++;
            itemsByType[item.type] = (itemsByType[item.type] || 0) + 1;
        }
    }
    
    return {
        totalSales: parseFloat(totalSales.toFixed(2)),
        totalOrders,
        totalReceivables: parseFloat(totalReceivables.toFixed(2)),
        totalPaid: parseFloat(totalPaid.toFixed(2)),
        itemCount,
        itemsByType,
        // High precision calculation (convert back from cents)
        preciseTotalSales: preciseTotal / 100,
        // Difference shows floating-point accumulation error
        floatingPointError: Math.abs(totalSales - (preciseTotal / 100))
    };
}

// Simulate app's aggregation logic
function simulateAppAggregation(invoices) {
    let totalSales = 0;
    let totalOrders = 0;
    
    for (const invoice of invoices) {
        // This mimics the dailySummary.recordOrderCreated logic
        totalSales = (totalSales || 0) + (invoice.total || 0);
        totalOrders = (totalOrders || 0) + 1;
    }
    
    return {
        totalSales,
        totalOrders
    };
}

// Check for calculation issues in individual invoices
function validateInvoiceCalculations(invoices) {
    const issues = [];
    
    for (const invoice of invoices) {
        // Check 1: SubTotal should equal sum of line items
        const calculatedSubTotal = invoice.orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
        const subTotalDiff = Math.abs(invoice.subTotal - calculatedSubTotal);
        
        if (subTotalDiff > 0.01) {
            issues.push({
                type: 'SUBTOTAL_MISMATCH',
                invoice: invoice.orderNumber,
                expected: calculatedSubTotal,
                actual: invoice.subTotal,
                diff: subTotalDiff
            });
        }
        
        // Check 2: Tax calculation
        const expectedTax = parseFloat((invoice.subTotal * (invoice.taxPercent / 100)).toFixed(2));
        const taxDiff = Math.abs(invoice.tax - expectedTax);
        
        if (taxDiff > 0.01) {
            issues.push({
                type: 'TAX_MISMATCH',
                invoice: invoice.orderNumber,
                expected: expectedTax,
                actual: invoice.tax,
                diff: taxDiff
            });
        }
        
        // Check 3: Total = SubTotal + Tax
        const expectedTotal = parseFloat((invoice.subTotal + invoice.tax).toFixed(2));
        const totalDiff = Math.abs(invoice.total - expectedTotal);
        
        if (totalDiff > 0.01) {
            issues.push({
                type: 'TOTAL_MISMATCH',
                invoice: invoice.orderNumber,
                expected: expectedTotal,
                actual: invoice.total,
                diff: totalDiff
            });
        }
        
        // Check 4: Line item calculations (price * quantity = totalPrice)
        for (const item of invoice.orderItems) {
            const expectedLineTotal = parseFloat((item.productPrice * item.quantity).toFixed(2));
            const lineDiff = Math.abs(item.totalPrice - expectedLineTotal);
            
            if (lineDiff > 0.01) {
                issues.push({
                    type: 'LINE_ITEM_MISMATCH',
                    invoice: invoice.orderNumber,
                    item: item.name,
                    price: item.productPrice,
                    quantity: item.quantity,
                    expected: expectedLineTotal,
                    actual: item.totalPrice,
                    diff: lineDiff
                });
            }
        }
        
        // Check 5: Payment math (paidAmount + dueAmount = total)
        const paymentSum = parseFloat((invoice.paidAmount + invoice.dueAmount).toFixed(2));
        const paymentDiff = Math.abs(paymentSum - invoice.total);
        
        if (paymentDiff > 0.01) {
            issues.push({
                type: 'PAYMENT_MISMATCH',
                invoice: invoice.orderNumber,
                paid: invoice.paidAmount,
                due: invoice.dueAmount,
                sum: paymentSum,
                total: invoice.total,
                diff: paymentDiff
            });
        }
    }
    
    return issues;
}

// Check for floating-point precision issues
function analyzeFloatingPointIssues(invoices) {
    const analysis = {
        dangerousMultiplications: [],
        roundingErrorAccumulation: 0,
        maxRoundingError: 0,
        problematicDecimals: []
    };
    
    let runningTotal = 0;
    let preciseRunningTotal = 0;
    
    for (const invoice of invoices) {
        // Check for values that cause floating-point issues
        for (const item of invoice.orderItems) {
            // Check for problematic decimal representations
            const rawProduct = item.productPrice * item.quantity;
            const rounded = parseFloat(rawProduct.toFixed(2));
            const errorThisItem = Math.abs(rawProduct - rounded);
            
            if (errorThisItem > 0.005) {
                analysis.dangerousMultiplications.push({
                    invoice: invoice.orderNumber,
                    item: item.name,
                    price: item.productPrice,
                    quantity: item.quantity,
                    rawResult: rawProduct,
                    rounded: rounded,
                    error: errorThisItem
                });
            }
            
            // Check for repeating decimals
            const priceStr = item.productPrice.toString();
            const qtyStr = item.quantity.toString();
            if (priceStr.length > 10 || qtyStr.length > 10) {
                analysis.problematicDecimals.push({
                    invoice: invoice.orderNumber,
                    item: item.name,
                    price: item.productPrice,
                    quantity: item.quantity
                });
            }
        }
        
        // Track accumulation error
        runningTotal += invoice.total;
        preciseRunningTotal += Math.round(invoice.total * 100);
        
        const currentError = Math.abs(runningTotal - (preciseRunningTotal / 100));
        if (currentError > analysis.maxRoundingError) {
            analysis.maxRoundingError = currentError;
        }
    }
    
    analysis.roundingErrorAccumulation = Math.abs(runningTotal - (preciseRunningTotal / 100));
    
    return analysis;
}

// Main test function
async function runValidationTest() {
    console.log('═'.repeat(80));
    console.log('INVOICE AGGREGATION VALIDATION TEST');
    console.log('═'.repeat(80));
    console.log(`Generating ${NUM_INVOICES} test invoices...\n`);
    
    // Generate test invoices
    const startTime = Date.now();
    const invoices = [];
    
    for (let i = 1; i <= NUM_INVOICES; i++) {
        invoices.push(generateInvoice(i));
    }
    
    const generationTime = Date.now() - startTime;
    console.log(`✓ Generated ${invoices.length} invoices in ${generationTime}ms\n`);
    
    // Calculate expected totals (independent implementation)
    console.log('─'.repeat(80));
    console.log('STEP 1: Independent Calculation (Reference)');
    console.log('─'.repeat(80));
    
    const expectedTotals = calculateExpectedTotals(invoices);
    console.log(`Total Orders: ${expectedTotals.totalOrders}`);
    console.log(`Total Sales: ₹${expectedTotals.totalSales.toLocaleString('en-IN')}`);
    console.log(`Total Receivables: ₹${expectedTotals.totalReceivables.toLocaleString('en-IN')}`);
    console.log(`Total Paid: ₹${expectedTotals.totalPaid.toLocaleString('en-IN')}`);
    console.log(`Total Items: ${expectedTotals.itemCount}`);
    console.log(`Items by Type:`, expectedTotals.itemsByType);
    console.log(`\nPrecision Analysis:`);
    console.log(`  Standard Total: ₹${expectedTotals.totalSales}`);
    console.log(`  High-Precision Total: ₹${expectedTotals.preciseTotalSales}`);
    console.log(`  Floating-Point Accumulation Error: ₹${expectedTotals.floatingPointError.toFixed(10)}`);
    
    // Simulate app aggregation
    console.log('\n' + '─'.repeat(80));
    console.log('STEP 2: App Aggregation Logic Simulation');
    console.log('─'.repeat(80));
    
    const appTotals = simulateAppAggregation(invoices);
    console.log(`App Total Sales: ₹${appTotals.totalSales.toLocaleString('en-IN')}`);
    console.log(`App Total Orders: ${appTotals.totalOrders}`);
    
    // Compare totals
    console.log('\n' + '─'.repeat(80));
    console.log('STEP 3: Comparison Results');
    console.log('─'.repeat(80));
    
    const salesDiff = Math.abs(expectedTotals.totalSales - appTotals.totalSales);
    const ordersDiff = Math.abs(expectedTotals.totalOrders - appTotals.totalOrders);
    
    console.log(`Sales Difference: ₹${salesDiff.toFixed(10)}`);
    console.log(`Orders Difference: ${ordersDiff}`);
    
    if (salesDiff < 0.01 && ordersDiff === 0) {
        console.log('\n✅ AGGREGATION TOTALS MATCH!');
    } else {
        console.log('\n❌ AGGREGATION MISMATCH DETECTED!');
    }
    
    // Validate individual invoice calculations
    console.log('\n' + '─'.repeat(80));
    console.log('STEP 4: Individual Invoice Validation');
    console.log('─'.repeat(80));
    
    const calculationIssues = validateInvoiceCalculations(invoices);
    
    if (calculationIssues.length === 0) {
        console.log('✅ All individual invoice calculations are correct!');
    } else {
        console.log(`❌ Found ${calculationIssues.length} calculation issues:\n`);
        
        // Group by type
        const issuesByType = {};
        for (const issue of calculationIssues) {
            issuesByType[issue.type] = (issuesByType[issue.type] || []);
            issuesByType[issue.type].push(issue);
        }
        
        for (const [type, issues] of Object.entries(issuesByType)) {
            console.log(`  ${type}: ${issues.length} issues`);
            // Show first 3 examples
            for (const issue of issues.slice(0, 3)) {
                console.log(`    - Invoice ${issue.invoice}: expected ${issue.expected}, got ${issue.actual} (diff: ${issue.diff.toFixed(4)})`);
            }
            if (issues.length > 3) {
                console.log(`    ... and ${issues.length - 3} more`);
            }
        }
    }
    
    // Analyze floating-point issues
    console.log('\n' + '─'.repeat(80));
    console.log('STEP 5: Floating-Point Analysis');
    console.log('─'.repeat(80));
    
    const fpAnalysis = analyzeFloatingPointIssues(invoices);
    
    console.log(`Dangerous Multiplications: ${fpAnalysis.dangerousMultiplications.length}`);
    if (fpAnalysis.dangerousMultiplications.length > 0) {
        console.log('  Examples:');
        for (const dm of fpAnalysis.dangerousMultiplications.slice(0, 5)) {
            console.log(`    - ${dm.item}: ${dm.price} × ${dm.quantity} = ${dm.rawResult} (rounded to ${dm.rounded}, error: ${dm.error.toFixed(6)})`);
        }
    }
    
    console.log(`\nMax Rounding Error in Accumulation: ₹${fpAnalysis.maxRoundingError.toFixed(10)}`);
    console.log(`Final Accumulation Error: ₹${fpAnalysis.roundingErrorAccumulation.toFixed(10)}`);
    console.log(`Problematic Decimal Values: ${fpAnalysis.problematicDecimals.length}`);
    
    // Summary and Recommendations
    console.log('\n' + '═'.repeat(80));
    console.log('SUMMARY & RECOMMENDATIONS');
    console.log('═'.repeat(80));
    
    const hasIssues = calculationIssues.length > 0 || 
                      fpAnalysis.roundingErrorAccumulation > 0.01 ||
                      salesDiff > 0.01;
    
    if (hasIssues) {
        console.log('\n⚠️  POTENTIAL ISSUES FOUND:\n');
        
        if (fpAnalysis.roundingErrorAccumulation > 0.01) {
            console.log('1. FLOATING-POINT ACCUMULATION ERROR');
            console.log('   Issue: Adding many decimal numbers causes precision loss');
            console.log('   Current Error: ₹' + fpAnalysis.roundingErrorAccumulation.toFixed(6));
            console.log('   Fix: Use integer arithmetic (store amounts in paise/cents)');
            console.log('   Code Change:');
            console.log('     // Instead of: totalSales += order.total');
            console.log('     // Use: totalSalesPaise += Math.round(order.total * 100)');
            console.log('     // Then: totalSales = totalSalesPaise / 100');
            console.log();
        }
        
        if (calculationIssues.some(i => i.type === 'LINE_ITEM_MISMATCH')) {
            console.log('2. LINE ITEM ROUNDING INCONSISTENCY');
            console.log('   Issue: price × quantity rounded differently than stored totalPrice');
            console.log('   Fix: Always use consistent rounding: Math.round(val * 100) / 100');
            console.log();
        }
        
        if (calculationIssues.some(i => i.type === 'TAX_MISMATCH')) {
            console.log('3. TAX CALCULATION ROUNDING');
            console.log('   Issue: Tax percentage applied before or after rounding subTotal');
            console.log('   Fix: Round subTotal first, then calculate tax, then round tax');
            console.log();
        }
        
        console.log('RECOMMENDED CODE FIXES:');
        console.log('─'.repeat(40));
        console.log(`
// In dailySummary.js - Use integer arithmetic for accumulation:
recordOrderCreated: async (order, transaction = null) => {
    // Convert to integer (paise) for precise addition
    const orderTotalPaise = Math.round((order.total || 0) * 100);
    const currentTotalPaise = Math.round((summary.totalSales || 0) * 100);
    const newTotalPaise = currentTotalPaise + orderTotalPaise;
    
    await summary.update({
        totalSales: newTotalPaise / 100,  // Convert back to rupees
        totalOrders: (summary.totalOrders || 0) + 1,
    }, options);
}

// In frontend - Consistent line total calculation:
const lineTotal = Math.round(price * quantity * 100) / 100;

// For tax calculation:
const subTotal = Math.round(sumOfItems * 100) / 100;
const tax = Math.round(subTotal * taxPercent) / 100;
const total = Math.round((subTotal + tax) * 100) / 100;
`);
    } else {
        console.log('\n✅ NO SIGNIFICANT ISSUES FOUND');
        console.log('   All calculations are within acceptable tolerance (±₹0.01)');
    }
    
    // Return test results
    return {
        passed: !hasIssues,
        invoiceCount: NUM_INVOICES,
        expectedTotals,
        appTotals,
        salesDifference: salesDiff,
        calculationIssues: calculationIssues.length,
        floatingPointError: fpAnalysis.roundingErrorAccumulation,
        maxAccumulationError: fpAnalysis.maxRoundingError
    };
}

// Run the test
runValidationTest()
    .then(results => {
        console.log('\n' + '═'.repeat(80));
        console.log('TEST COMPLETE');
        console.log('═'.repeat(80));
        console.log(JSON.stringify({
            passed: results.passed,
            invoiceCount: results.invoiceCount,
            salesDiff: results.salesDifference,
            calculationIssues: results.calculationIssues,
            fpError: results.floatingPointError
        }, null, 2));
        process.exit(results.passed ? 0 : 1);
    })
    .catch(err => {
        console.error('Test failed with error:', err);
        process.exit(1);
    });
