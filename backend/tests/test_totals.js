/**
 * Test script to create 40 fake bills and verify grand total matches
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'https://quick-sale-entry.preview.emergentagent.com/api';
const USERNAME = 'admin';
const PASSWORD = 'admin123';

// Generate random bill data
function generateBill(index) {
    const quantity = Math.floor(Math.random() * 5) + 1; // 1-5
    const unitPrice = Math.round((Math.random() * 500 + 50) * 100) / 100; // 50-550
    const totalPrice = Math.round(quantity * unitPrice * 100) / 100;
    
    return {
        orderDate: new Date().toISOString().split('T')[0],
        customerName: `Test Customer ${index}`,
        customerMobile: `98765${String(index).padStart(5, '0')}`,
        subTotal: totalPrice,
        total: totalPrice,
        tax: 0,
        taxPercent: 0,
        paidAmount: totalPrice, // Fully paid
        orderItems: [
            {
                productId: 'test-product-' + index,
                name: `Test Product ${index}`,
                altName: '',
                quantity: quantity,
                productPrice: unitPrice,
                totalPrice: totalPrice,
                type: 'non-weighted'
            }
        ]
    };
}

async function login() {
    console.log('Logging in...');
    const response = await axios.post(`${API_URL}/auth/login`, {
        username: USERNAME,
        password: PASSWORD
    });
    
    if (response.data.status !== 200) {
        throw new Error('Login failed: ' + response.data.message);
    }
    
    return response.data.data.token;
}

async function createOrder(token, orderData) {
    const response = await axios.post(`${API_URL}/orders`, orderData, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    if (response.data.status !== 200) {
        throw new Error('Create order failed: ' + response.data.message);
    }
    
    return response.data.data;
}

async function getTodaySummary(token) {
    const response = await axios.get(`${API_URL}/dashboard/summary/today`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    return response.data.data;
}

async function listOrders(token, date) {
    const response = await axios.get(`${API_URL}/orders`, {
        params: { date: date },
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    return response.data.data;
}

async function main() {
    const NUM_BILLS = 40;
    let expectedTotal = 0;
    const createdOrders = [];
    
    try {
        // Login
        const token = await login();
        console.log('✅ Logged in successfully\n');
        
        // Get initial summary
        const initialSummary = await getTodaySummary(token);
        console.log(`📊 Initial Summary:`);
        console.log(`   - Total Sales: ₹${initialSummary?.totalSales || 0}`);
        console.log(`   - Total Orders: ${initialSummary?.totalOrders || 0}\n`);
        
        const initialSales = initialSummary?.totalSales || 0;
        const initialOrders = initialSummary?.totalOrders || 0;
        
        // Create 40 bills
        console.log(`📝 Creating ${NUM_BILLS} test bills...\n`);
        
        for (let i = 1; i <= NUM_BILLS; i++) {
            const billData = generateBill(i);
            expectedTotal += billData.total;
            
            try {
                const order = await createOrder(token, billData);
                createdOrders.push(order);
                console.log(`   Bill ${i}/${NUM_BILLS}: ${order.orderNumber} - ₹${billData.total.toFixed(2)}`);
            } catch (err) {
                console.error(`   ❌ Bill ${i} FAILED: ${err.message}`);
            }
            
            // Small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(`\n✅ Created ${createdOrders.length}/${NUM_BILLS} bills`);
        console.log(`📊 Expected total from new bills: ₹${expectedTotal.toFixed(2)}\n`);
        
        // Get final summary
        const finalSummary = await getTodaySummary(token);
        console.log(`📊 Final Summary:`);
        console.log(`   - Total Sales: ₹${finalSummary?.totalSales || 0}`);
        console.log(`   - Total Orders: ${finalSummary?.totalOrders || 0}\n`);
        
        // Calculate actual totals from orders list
        const today = new Date().toISOString().split('T')[0];
        const allOrders = await listOrders(token, today);
        
        let actualTotalFromOrders = 0;
        if (allOrders && allOrders.orders) {
            actualTotalFromOrders = allOrders.orders.reduce((sum, order) => sum + (order.total || 0), 0);
        }
        
        console.log(`📋 Verification:`);
        console.log(`   - Orders in DB today: ${allOrders?.orders?.length || 0}`);
        console.log(`   - Sum of order totals from DB: ₹${actualTotalFromOrders.toFixed(2)}`);
        console.log(`   - Dashboard totalSales: ₹${finalSummary?.totalSales || 0}`);
        console.log(`   - Expected new bills total: ₹${expectedTotal.toFixed(2)}`);
        console.log(`   - Previous sales + new: ₹${(initialSales + expectedTotal).toFixed(2)}\n`);
        
        // Verify match
        const dashboardTotal = finalSummary?.totalSales || 0;
        const match = Math.abs(actualTotalFromOrders - dashboardTotal) < 0.01;
        
        if (match) {
            console.log(`✅ SUCCESS: Dashboard total (₹${dashboardTotal.toFixed(2)}) matches orders sum (₹${actualTotalFromOrders.toFixed(2)})`);
        } else {
            console.log(`❌ MISMATCH: Dashboard total (₹${dashboardTotal.toFixed(2)}) != orders sum (₹${actualTotalFromOrders.toFixed(2)})`);
            console.log(`   Difference: ₹${Math.abs(dashboardTotal - actualTotalFromOrders).toFixed(2)}`);
        }
        
        // Summary
        console.log(`\n${'='.repeat(50)}`);
        console.log(`SIMULATION RESULTS`);
        console.log(`${'='.repeat(50)}`);
        console.log(`Bills created: ${createdOrders.length}`);
        console.log(`Expected total: ₹${expectedTotal.toFixed(2)}`);
        console.log(`Dashboard shows: ₹${dashboardTotal.toFixed(2)}`);
        console.log(`Order sum: ₹${actualTotalFromOrders.toFixed(2)}`);
        console.log(`Match: ${match ? '✅ YES' : '❌ NO'}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

main();
