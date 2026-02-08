/**
 * Migration: Convert monetary columns from DOUBLE PRECISION to DECIMAL
 * 
 * This migration fixes potential floating-point precision issues by converting
 * all monetary columns to DECIMAL(15, 2) which stores exact values.
 * 
 * Run with: node migrations/fix_decimal_columns.js
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');

const config = {
    username: process.env.DB_USER || 'Rishabh',
    password: process.env.PASSWORD || 'yttriumR',
    database: process.env.DATABASE_NAME || 'customerInvoice',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres'
};

const sequelize = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: console.log
});

// Columns to convert in each table
const MONETARY_COLUMNS = {
    orders: ['subTotal', 'total', 'tax', 'paidAmount', 'dueAmount'],
    orderItems: ['productPrice', 'totalPrice'],
    dailySummary: ['openingBalance', 'totalSales', 'totalPurchases', 'totalPaymentsReceived', 'totalPaymentsMade'],
    payments: ['amount'],
    customers: ['currentBalance'],
    purchaseBills: ['total', 'subTotal', 'tax', 'paidAmount', 'dueAmount'],
    purchaseItems: ['unitPrice', 'totalPrice'],
    dailyExpenses: ['amount'],
    stock: ['costPrice', 'sellingPrice', 'currentValue'],
    stockTransactions: ['unitPrice', 'totalValue'],
    products: ['price']
};

async function migrate() {
    console.log('═'.repeat(60));
    console.log('MIGRATION: Convert DOUBLE PRECISION to DECIMAL(15, 2)');
    console.log('═'.repeat(60));
    
    try {
        await sequelize.authenticate();
        console.log('✓ Database connected\n');
        
        for (const [tableName, columns] of Object.entries(MONETARY_COLUMNS)) {
            console.log(`\nProcessing table: ${tableName}`);
            console.log('─'.repeat(40));
            
            // Check if table exists
            const tableExists = await sequelize.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = '${tableName}'
                )
            `, { type: Sequelize.QueryTypes.SELECT });
            
            if (!tableExists[0].exists) {
                console.log(`  ⚠ Table "${tableName}" does not exist, skipping`);
                continue;
            }
            
            for (const column of columns) {
                try {
                    // Check if column exists and its current type
                    const columnInfo = await sequelize.query(`
                        SELECT column_name, data_type, numeric_precision, numeric_scale
                        FROM information_schema.columns
                        WHERE table_name = '${tableName}' AND column_name = '${column}'
                    `, { type: Sequelize.QueryTypes.SELECT });
                    
                    if (columnInfo.length === 0) {
                        console.log(`  ⚠ Column "${column}" does not exist, skipping`);
                        continue;
                    }
                    
                    const currentType = columnInfo[0].data_type;
                    
                    if (currentType === 'numeric') {
                        console.log(`  ✓ "${column}" is already DECIMAL`);
                        continue;
                    }
                    
                    // Convert column to DECIMAL(15, 2)
                    await sequelize.query(`
                        ALTER TABLE "${tableName}" 
                        ALTER COLUMN "${column}" TYPE DECIMAL(15, 2) 
                        USING "${column}"::DECIMAL(15, 2)
                    `);
                    
                    console.log(`  ✓ Converted "${column}" from ${currentType} to DECIMAL(15, 2)`);
                    
                } catch (colError) {
                    console.log(`  ✗ Error converting "${column}": ${colError.message}`);
                }
            }
        }
        
        console.log('\n' + '═'.repeat(60));
        console.log('MIGRATION COMPLETE');
        console.log('═'.repeat(60));
        
        // Verify changes
        console.log('\nVerification - orders table:');
        const verifyResult = await sequelize.query(`
            SELECT column_name, data_type, numeric_precision, numeric_scale
            FROM information_schema.columns
            WHERE table_name = 'orders' 
            AND column_name IN ('total', 'subTotal', 'tax', 'paidAmount', 'dueAmount')
            ORDER BY column_name
        `, { type: Sequelize.QueryTypes.SELECT });
        
        for (const col of verifyResult) {
            console.log(`  ${col.column_name}: ${col.data_type}(${col.numeric_precision}, ${col.numeric_scale})`);
        }
        
    } catch (error) {
        console.error('Migration failed:', error.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

migrate();
