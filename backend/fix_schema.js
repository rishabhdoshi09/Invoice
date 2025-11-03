require('dotenv').config();
const { Sequelize } = require('sequelize');
const config = require('./src/config/config.js');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    dialect: dbConfig.dialect,
    port: dbConfig.port,
    dialectOptions: dbConfig.dialectOptions,
    logging: console.log
  }
);

async function fixSchema() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Check current schema for suppliers
    console.log('\n📋 Current suppliers schema:');
    const [supplierColumns] = await sequelize.query(`
      SELECT column_name, column_default, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'suppliers'
      ORDER BY ordinal_position;
    `);
    console.log(supplierColumns);

    // Check current schema for customers
    console.log('\n📋 Current customers schema:');
    const [customerColumns] = await sequelize.query(`
      SELECT column_name, column_default, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'customers'
      ORDER BY ordinal_position;
    `);
    console.log(customerColumns);

    // Drop and recreate suppliers table
    console.log('\n🗑️  Dropping suppliers table...');
    await sequelize.query('DROP TABLE IF EXISTS "suppliers" CASCADE;');
    console.log('✅ Suppliers table dropped');

    console.log('\n🔧 Creating suppliers table with correct schema...');
    await sequelize.query(`
      CREATE TABLE "suppliers" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" VARCHAR(255) NOT NULL,
        "mobile" VARCHAR(255),
        "email" VARCHAR(255),
        "address" TEXT,
        "gstin" VARCHAR(255),
        "openingBalance" DOUBLE PRECISION,
        "currentBalance" DOUBLE PRECISION,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✅ Suppliers table created');

    // Drop and recreate customers table
    console.log('\n🗑️  Dropping customers table...');
    await sequelize.query('DROP TABLE IF EXISTS "customers" CASCADE;');
    console.log('✅ Customers table dropped');

    console.log('\n🔧 Creating customers table with correct schema...');
    await sequelize.query(`
      CREATE TABLE "customers" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" VARCHAR(255) NOT NULL,
        "mobile" VARCHAR(255),
        "email" VARCHAR(255),
        "address" TEXT,
        "gstin" VARCHAR(255),
        "openingBalance" DOUBLE PRECISION,
        "currentBalance" DOUBLE PRECISION,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✅ Customers table created');

    // Verify new schema
    console.log('\n✅ New suppliers schema:');
    const [newSupplierColumns] = await sequelize.query(`
      SELECT column_name, column_default, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'suppliers'
      ORDER BY ordinal_position;
    `);
    console.log(newSupplierColumns);

    console.log('\n✅ New customers schema:');
    const [newCustomerColumns] = await sequelize.query(`
      SELECT column_name, column_default, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'customers'
      ORDER BY ordinal_position;
    `);
    console.log(newCustomerColumns);

    console.log('\n🎉 Schema fix completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
  }
}

fixSchema();
