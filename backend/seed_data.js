const db = require('./src/models');
const bcrypt = require('bcrypt');

async function seed() {
    try {
        console.log('Seeding data...');

        // Create admin and staff users
        const adminPassword = await bcrypt.hash('admin123', 10);
        const staffPassword = await bcrypt.hash('staff123', 10);

        const [admin] = await db.user.findOrCreate({
            where: { username: 'admin' },
            defaults: {
                username: 'admin',
                password: adminPassword,
                role: 'admin'
            }
        });
        console.log('Admin user:', admin.username);

        const [staff] = await db.user.findOrCreate({
            where: { username: 'staff' },
            defaults: {
                username: 'staff',
                password: staffPassword,
                role: 'billing_staff'
            }
        });
        console.log('Staff user:', staff.username);

        // Create a supplier
        const [supplier] = await db.supplier.findOrCreate({
            where: { name: 'Test Supplier' },
            defaults: {
                name: 'Test Supplier',
                address: '123 Main St',
                phone: '9876543210',
                gstin: '27ABCDE1234F1ZK'
            }
        });
        console.log('Supplier:', supplier.name);

        // Create some products
        const products = [
            { name: 'Steel Utensil A', price: 150, type: 'weighted' },
            { name: 'Steel Utensil B', price: 220, type: 'weighted' },
            { name: 'Steel Utensil C', price: 310, type: 'weighted' },
            { name: 'Steel Box', price: 180, type: 'piece' }
        ];

        for (const p of products) {
            await db.product.findOrCreate({
                where: { name: p.name },
                defaults: p
            });
        }
        console.log('Products created');

        // Create a customer
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

        // Create a few sample orders
        const orderCount = await db.order.count();
        if (orderCount === 0) {
            const dates = ['17-01-2026', '18-01-2026'];
            for (let i = 0; i < 5; i++) {
                const orderNumber = `INV/2025-26/${String(i + 1).padStart(4, '0')}`;
                const order = await db.order.create({
                    orderNumber,
                    orderDate: dates[i % 2],
                    customerName: 'Test Customer',
                    customerMobile: '9876543210',
                    subTotal: 200,
                    tax: 10,
                    total: 210,
                    paidAmount: 210,
                    dueAmount: 0,
                    paymentStatus: 'paid',
                    createdBy: admin.id
                });

                await db.orderItems.create({
                    orderId: order.id,
                    name: products[i % products.length].name,
                    productPrice: products[i % products.length].price,
                    quantity: 1.5,
                    totalPrice: 200,
                    type: 'weighted'
                });
            }
            console.log('Sample orders created');
        }

        console.log('Seeding complete!');
        process.exit(0);
    } catch (error) {
        console.error('Seed error:', error);
        process.exit(1);
    }
}

seed();
