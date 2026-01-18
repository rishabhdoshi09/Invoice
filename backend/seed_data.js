const db = require('./src/models');

async function seed() {
    try {
        console.log('Seeding data...');

        const supplier = await db.supplier.findOne({ where: { name: 'Test Supplier' } });
        if (!supplier) {
            console.log('Supplier not found, skipping purchase bill');
            process.exit(0);
        }

        // Create a sample purchase bill
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
            console.log('Sample purchase bill created');
        } else {
            console.log(`Purchase bills already exist: ${purchaseCount}`);
        }

        console.log('Seeding complete!');
        process.exit(0);
    } catch (error) {
        console.error('Seed error:', error);
        process.exit(1);
    }
}

seed();
