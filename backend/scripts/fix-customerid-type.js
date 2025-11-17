/**
 * Fix customerId Type Mismatch
 * 
 * This script changes the customerId column in orders table from INTEGER to UUID
 * to match the customer.id type
 * 
 * Usage: node scripts/fix-customerid-type.js
 */

const { Sequelize } = require('sequelize');
const config = require('../src/config/config');

async function fixCustomerIdType() {
    console.log('🔧 Starting customerId type fix...\n');
    
    const env = process.env.NODE_ENV || 'development';
    const dbConfig = config[env];
    
    console.log(`📊 Database: ${dbConfig.database}`);
    console.log(`👤 User: ${dbConfig.username}\n`);
    
    const sequelize = new Sequelize(
        dbConfig.database,
        dbConfig.username,
        dbConfig.password,
        {
            host: dbConfig.host,
            port: dbConfig.port,
            dialect: dbConfig.dialect,
            logging: false
        }
    );

    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database\n');

        // Check current type
        console.log('🔍 Checking current customerId type...');
        const [currentType] = await sequelize.query(`
            SELECT data_type, column_name
            FROM information_schema.columns
            WHERE table_name = 'orders' AND column_name = 'customerId';
        `);
        
        if (currentType.length > 0) {
            console.log(`   Current type: ${currentType[0].data_type}\n`);
            
            if (currentType[0].data_type === 'uuid') {
                console.log('✅ customerId is already UUID type. No fix needed!');
                await sequelize.close();
                process.exit(0);
            }
        }

        // Drop the foreign key constraint if it exists
        console.log('📝 Step 1: Dropping foreign key constraint (if exists)...');
        await sequelize.query(`
            DO $$ 
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'orders_customerId_fkey'
                ) THEN
                    ALTER TABLE orders DROP CONSTRAINT orders_customerId_fkey;
                END IF;
            END $$;
        `);
        console.log('✅ Constraint dropped\n');

        // Change column type to UUID
        console.log('📝 Step 2: Converting customerId from INTEGER to UUID...');
        console.log('   ⚠️  This will set all existing customerId values to NULL');
        console.log('   (They need to be re-linked manually or via script)\n');
        
        await sequelize.query(`
            ALTER TABLE orders 
            ALTER COLUMN "customerId" TYPE UUID 
            USING NULL;
        `);
        console.log('✅ Column type changed to UUID\n');

        // Add foreign key constraint
        console.log('📝 Step 3: Adding foreign key constraint...');
        await sequelize.query(`
            ALTER TABLE orders 
            ADD CONSTRAINT orders_customerId_fkey 
            FOREIGN KEY ("customerId") 
            REFERENCES customers(id) 
            ON UPDATE CASCADE 
            ON DELETE SET NULL;
        `);
        console.log('✅ Foreign key constraint added\n');

        // Verify the change
        console.log('📝 Step 4: Verifying the change...');
        const [newType] = await sequelize.query(`
            SELECT data_type, column_name
            FROM information_schema.columns
            WHERE table_name = 'orders' AND column_name = 'customerId';
        `);
        
        console.log(`   New type: ${newType[0].data_type}\n`);

        console.log('=' .repeat(60));
        console.log('🎉 customerId type fix completed successfully!');
        console.log('=' .repeat(60));
        console.log('\n⚠️  IMPORTANT:');
        console.log('   All existing customerId values have been set to NULL.');
        console.log('   Orders are no longer linked to customers.');
        console.log('\n💡 Next steps:');
        console.log('   1. Restart your backend server');
        console.log('   2. The reports page should now work');
        console.log('   3. New orders will link properly to customers');
        console.log('   4. Old orders can be re-linked if needed\n');

        await sequelize.close();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Error:');
        console.error(error.message);
        console.error('\nFull error:');
        console.error(error);
        await sequelize.close();
        process.exit(1);
    }
}

fixCustomerIdType();
