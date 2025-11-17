/**
 * Data Fix Script: Create Ledgers for Existing Customers and Suppliers
 * 
 * This script creates ledger entries for any customers or suppliers
 * that don't have a ledgerId assigned.
 * 
 * Usage: node scripts/fix-ledgers.js
 */

const db = require('../src/models');

async function fixLedgers() {
    try {
        console.log('Starting ledger fix process...\n');
        
        await db.sequelize.authenticate();
        console.log('✓ Database connection established\n');

        // Fix customers
        console.log('Processing customers...');
        const customers = await db.customer.findAll();
        let customersFixed = 0;
        
        for (const customer of customers) {
            if (!customer.ledgerId) {
                const ledger = await db.ledger.create({
                    ledgerName: `Customer: ${customer.name}`,
                    ledgerType: 'asset',
                    openingBalance: customer.openingBalance || 0,
                    currentBalance: customer.currentBalance || 0
                });
                
                await customer.update({ ledgerId: ledger.id });
                console.log(`  ✓ Created ledger for customer: ${customer.name} (ID: ${customer.id})`);
                customersFixed++;
            }
        }
        
        console.log(`\nCustomers processed: ${customers.length}`);
        console.log(`Customers fixed: ${customersFixed}\n`);

        // Fix suppliers
        console.log('Processing suppliers...');
        const suppliers = await db.supplier.findAll();
        let suppliersFixed = 0;
        
        for (const supplier of suppliers) {
            if (!supplier.ledgerId) {
                const ledger = await db.ledger.create({
                    ledgerName: `Supplier: ${supplier.name}`,
                    ledgerType: 'liability',
                    openingBalance: supplier.openingBalance || 0,
                    currentBalance: supplier.currentBalance || 0
                });
                
                await supplier.update({ ledgerId: ledger.id });
                console.log(`  ✓ Created ledger for supplier: ${supplier.name} (ID: ${supplier.id})`);
                suppliersFixed++;
            }
        }
        
        console.log(`\nSuppliers processed: ${suppliers.length}`);
        console.log(`Suppliers fixed: ${suppliersFixed}\n`);

        console.log('='.repeat(50));
        console.log('✓ Ledger fix process completed successfully!');
        console.log(`Total records fixed: ${customersFixed + suppliersFixed}`);
        console.log('='.repeat(50));
        
        process.exit(0);
    } catch (error) {
        console.error('\n✗ Error during ledger fix process:');
        console.error(error);
        process.exit(1);
    }
}

// Run the fix
fixLedgers();
