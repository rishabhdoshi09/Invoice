/**
 * Run Migration Script - No psql Required!
 * 
 * This script runs the database migration using Node.js
 * No need for psql command line tool
 * 
 * Usage: node scripts/run-migration.js
 */

const { Sequelize } = require('sequelize');
const config = require('../src/config/config');

async function runMigration() {
    console.log('🚀 Starting database migration...\n');
    
    // Get database configuration
    const env = process.env.NODE_ENV || 'development';
    const dbConfig = config[env];
    
    console.log(`📊 Connecting to database: ${dbConfig.database}`);
    console.log(`👤 User: ${dbConfig.username}`);
    console.log(`🏠 Host: ${dbConfig.host}:${dbConfig.port}\n`);
    
    // Create Sequelize instance
    const sequelize = new Sequelize(
        dbConfig.database,
        dbConfig.username,
        dbConfig.password,
        {
            host: dbConfig.host,
            port: dbConfig.port,
            dialect: dbConfig.dialect,
            logging: false // Set to console.log to see SQL queries
        }
    );

    try {
        // Test connection
        await sequelize.authenticate();
        console.log('✅ Database connection established\n');

        // Step 1: Add ledgerId to customers table
        console.log('📝 Step 1: Adding ledgerId column to customers table...');
        await sequelize.query(`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS "ledgerId" UUID;
        `);
        console.log('✅ Column added to customers\n');

        // Step 2: Add foreign key constraint for customers
        console.log('📝 Step 2: Adding foreign key constraint for customers...');
        await sequelize.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_customers_ledger'
                ) THEN
                    ALTER TABLE customers ADD CONSTRAINT fk_customers_ledger 
                        FOREIGN KEY ("ledgerId") REFERENCES ledgers(id) 
                        ON UPDATE CASCADE ON DELETE SET NULL;
                END IF;
            END $$;
        `);
        console.log('✅ Foreign key constraint added for customers\n');

        // Step 3: Add ledgerId to suppliers table
        console.log('📝 Step 3: Adding ledgerId column to suppliers table...');
        await sequelize.query(`
            ALTER TABLE suppliers 
            ADD COLUMN IF NOT EXISTS "ledgerId" UUID;
        `);
        console.log('✅ Column added to suppliers\n');

        // Step 4: Add foreign key constraint for suppliers
        console.log('📝 Step 4: Adding foreign key constraint for suppliers...');
        await sequelize.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_suppliers_ledger'
                ) THEN
                    ALTER TABLE suppliers ADD CONSTRAINT fk_suppliers_ledger 
                        FOREIGN KEY ("ledgerId") REFERENCES ledgers(id) 
                        ON UPDATE CASCADE ON DELETE SET NULL;
                END IF;
            END $$;
        `);
        console.log('✅ Foreign key constraint added for suppliers\n');

        // Step 5: Verify columns were added
        console.log('📝 Step 5: Verifying columns...');
        const [results] = await sequelize.query(`
            SELECT 
                table_name, 
                column_name, 
                data_type, 
                is_nullable
            FROM information_schema.columns
            WHERE table_name IN ('customers', 'suppliers') 
            AND column_name = 'ledgerId'
            ORDER BY table_name;
        `);
        
        console.log('✅ Verification results:');
        results.forEach(row => {
            console.log(`   - ${row.table_name}.${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
        });
        console.log();

        // Step 6: Create Cash Account ledger
        console.log('📝 Step 6: Creating Cash Account ledger...');
        const [insertResult] = await sequelize.query(`
            INSERT INTO ledgers (id, "ledgerName", "ledgerType", "openingBalance", "currentBalance", "createdAt", "updatedAt")
            SELECT 
                '550e8400-e29b-41d4-a716-446655440000'::uuid,
                'Cash Account',
                'asset',
                0,
                0,
                NOW(),
                NOW()
            WHERE NOT EXISTS (
                SELECT 1 FROM ledgers WHERE "ledgerName" = 'Cash Account'
            );
        `);
        
        if (insertResult.rowCount > 0) {
            console.log('✅ Cash Account ledger created\n');
        } else {
            console.log('ℹ️  Cash Account ledger already exists\n');
        }

        // Step 7: Verify Cash Account
        console.log('📝 Step 7: Verifying Cash Account ledger...');
        const [cashAccount] = await sequelize.query(`
            SELECT id, "ledgerName", "ledgerType" 
            FROM ledgers 
            WHERE "ledgerName" = 'Cash Account';
        `);
        
        if (cashAccount.length > 0) {
            console.log('✅ Cash Account verified:');
            console.log(`   - ID: ${cashAccount[0].id}`);
            console.log(`   - Name: ${cashAccount[0].ledgerName}`);
            console.log(`   - Type: ${cashAccount[0].ledgerType}\n`);
        }

        console.log('=' .repeat(60));
        console.log('🎉 Migration completed successfully!');
        console.log('=' .repeat(60));
        console.log('\n📋 Next steps:');
        console.log('   1. Run: node scripts/fix-ledgers.js');
        console.log('   2. Restart your backend server');
        console.log('   3. Test payment recording\n');

        await sequelize.close();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Migration failed:');
        console.error(error.message);
        console.error('\nFull error:');
        console.error(error);
        
        await sequelize.close();
        process.exit(1);
    }
}

// Run the migration
runMigration();
