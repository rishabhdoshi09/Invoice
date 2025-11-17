/**
 * Check Database Permissions Script
 * 
 * This script checks who owns the tables and what permissions you have
 * 
 * Usage: node scripts/check-permissions.js
 */

const { Sequelize } = require('sequelize');
const config = require('../src/config/config');

async function checkPermissions() {
    console.log('🔍 Checking database permissions...\n');
    
    const env = process.env.NODE_ENV || 'development';
    const dbConfig = config[env];
    
    console.log(`📊 Database: ${dbConfig.database}`);
    console.log(`👤 Current User: ${dbConfig.username}\n`);
    
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

        // Check table ownership
        console.log('📋 Table Ownership:\n');
        const [tables] = await sequelize.query(`
            SELECT 
                tablename, 
                tableowner,
                CASE 
                    WHEN tableowner = current_user THEN '✅ You own this'
                    ELSE '❌ Owned by someone else'
                END as status
            FROM pg_tables 
            WHERE schemaname = 'public'
            AND tablename IN ('customers', 'suppliers', 'ledgers', 'payments')
            ORDER BY tablename;
        `);
        
        tables.forEach(table => {
            console.log(`   ${table.status} - ${table.tablename} (owner: ${table.tableowner})`);
        });
        console.log();

        // Check current user
        const [currentUser] = await sequelize.query(`SELECT current_user;`);
        console.log(`🔐 You are connected as: ${currentUser[0].current_user}\n`);

        // Check if user is superuser
        const [superuser] = await sequelize.query(`
            SELECT usesuper FROM pg_user WHERE usename = current_user;
        `);
        console.log(`🛡️  Superuser privileges: ${superuser[0].usesuper ? 'Yes ✅' : 'No ❌'}\n`);

        // Get list of all database users
        console.log('👥 All database users:\n');
        const [users] = await sequelize.query(`
            SELECT 
                usename,
                usesuper,
                usecreatedb
            FROM pg_user
            ORDER BY usename;
        `);
        
        users.forEach(user => {
            const badges = [];
            if (user.usesuper) badges.push('SUPERUSER');
            if (user.usecreatedb) badges.push('CREATEDB');
            const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : '';
            console.log(`   - ${user.usename}${badgeStr}`);
        });
        console.log();

        // Provide recommendations
        console.log('=' .repeat(60));
        console.log('💡 RECOMMENDATIONS:\n');
        
        const ownedTables = tables.filter(t => t.tableowner === currentUser[0].current_user);
        const notOwnedTables = tables.filter(t => t.tableowner !== currentUser[0].current_user);
        
        if (notOwnedTables.length > 0) {
            const owner = notOwnedTables[0].tableowner;
            console.log(`❌ Problem: You (${currentUser[0].current_user}) don't own some tables.`);
            console.log(`   Tables are owned by: ${owner}\n`);
            
            console.log('🔧 Solution Options:\n');
            console.log('Option 1: Update your .env file to use the table owner:');
            console.log(`   DB_USER=${owner}\n`);
            
            console.log('Option 2: Grant yourself permissions (requires superuser access):');
            console.log('   Run: node scripts/grant-permissions.js\n');
            
            console.log('Option 3: Change table ownership (requires superuser access):');
            console.log(`   Run SQL: ALTER TABLE customers OWNER TO ${currentUser[0].current_user};\n`);
            
        } else {
            console.log('✅ You own all the necessary tables!');
            console.log('   The migration should work. Try running it again.\n');
        }
        
        console.log('=' .repeat(60));

        await sequelize.close();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Error:');
        console.error(error.message);
        await sequelize.close();
        process.exit(1);
    }
}

checkPermissions();
