const db = require('./src/models');

async function seed() {
    try {
        console.log('Seeding data...');

        // Create admin and staff users
        const [admin] = await db.user.findOrCreate({
            where: { username: 'admin' },
            defaults: {
                username: 'admin',
                password: 'admin123',
                name: 'Administrator',
                role: 'admin'
            }
        });
        console.log('Admin user:', admin.username);

        const [staff] = await db.user.findOrCreate({
            where: { username: 'staff' },
            defaults: {
                username: 'staff',
                password: 'staff123',
                name: 'Billing Staff',
                role: 'billing_staff'
            }
        });
        console.log('Staff user:', staff.username);

        // Create supplier
        const [supplier] = await db.supplier.findOrCreate({
            where: { name: 'Test Supplier' },
            defaults: {
                name: 'Test Supplier',
                address: '123 Main St',
                gstin: '27ABCDE1234F1ZK'
            }
        });
        console.log('Supplier:', supplier.name);

        // Create products with different price ranges
        const products = [
            { name: 'Steel Utensil A', pricePerKg: 150, type: 'weighted' },  // 100-199 range
            { name: 'Steel Utensil B', pricePerKg: 220, type: 'weighted' },  // 200-299 range
            { name: 'Steel Utensil C', pricePerKg: 250, type: 'weighted' },  // 200-299 range
            { name: 'Steel Utensil D', pricePerKg: 310, type: 'weighted' },  // 300-399 range
            { name: 'Steel Box', pricePerKg: 180, type: 'non-weighted' }
        ];

        for (const p of products) {
            await db.product.findOrCreate({
                where: { name: p.name },
                defaults: p
            });
        }
        console.log('Products created');

        // Create customer
        const [customer] = await db.customer.findOrCreate({
            where: { mobile: '9876543210' },
            defaults: {
                name: 'Test Customer',
                mobile: '9876543210',
                address: '456 Customer St'
            }
        });
        console.log('Customer:', customer.name);

        // Create invoice sequence
        await db.invoiceSequence.findOrCreate({
            where: { prefix: 'INV' },
            defaults: {
                prefix: 'INV',
                currentNumber: 0,
                dailyNumber: 0,
                lastDate: new Date().toISOString().split('T')[0],
                lastFinancialYear: '2025-26'
            }
        });
        console.log('Invoice sequence created');

        // Create orders with items in different price ranges
        const orderCount = await db.order.count();
        if (orderCount === 0) {
            const dates = ['17-01-2026', '18-01-2026', '19-01-2026'];
            const priceRanges = [
                { product: 'Steel Utensil A', price: 150 },  // 100-199
                { product: 'Steel Utensil B', price: 220 },  // 200-299
                { product: 'Steel Utensil C', price: 250 },  // 200-299
                { product: 'Steel Utensil D', price: 310 },  // 300-399
                { product: 'Steel Box', price: 180 }         // 100-199
            ];

            for (let i = 0; i < 5; i++) {
                const orderNumber = `INV/2025-26/${String(i + 1).padStart(4, '0')}`;
                const item = priceRanges[i];
                const qty = 1.5;
                const total = item.price * qty;
                
                const order = await db.order.create({
                    orderNumber,
                    orderDate: dates[i % dates.length],
                    customerName: 'Test Customer',
                    customerMobile: '9876543210',
                    subTotal: total,
                    tax: total * 0.05,
                    total: total * 1.05,
                    paidAmount: total * 1.05,
                    dueAmount: 0,
                    paymentStatus: 'paid',
                    createdBy: admin.id
                });

                await db.orderItems.create({
                    orderId: order.id,
                    name: item.product,
                    productPrice: item.price,
                    quantity: qty,
                    totalPrice: total,
                    type: 'weighted'
                });
                console.log(`Order ${orderNumber} created with price ₹${item.price}`);
            }
        } else {
            console.log(`Orders already exist: ${orderCount}`);
        }

        // Create purchase bill
        const purchaseCount = await db.purchaseBill.count();
        if (purchaseCount === 0) {
            const purchase = await db.purchaseBill.create({
                billNumber: 'PB/2025-26/0001',
                billDate: '18-01-2026',
                supplierId: supplier.id,
                subTotal: 5000,
                tax: 900,
                taxPercent: 18,
                total: 5900,
                paidAmount: 5900,
                paymentStatus: 'paid'
            });

            await db.purchaseItem.create({
                purchaseBillId: purchase.id,
                name: 'Steel Raw Material',
                quantity: 10,
                price: 500,
                totalPrice: 5000
            });
            console.log('Purchase bill created');
        }

        console.log('Seeding complete!');
        process.exit(0);
    } catch (error) {
        console.error('Seed error:', error);
        process.exit(1);
    }
}

seed();
