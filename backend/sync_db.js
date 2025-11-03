require('dotenv').config();
const db = require('./src/models');

async function syncDatabase() {
  try {
    console.log('🔄 Synchronizing database models...\n');
    
    // Sync all models with alter: true to update existing tables
    await db.sequelize.sync({ alter: true });
    
    console.log('\n✅ Database synchronized successfully!');
    console.log('\n📋 All tables:');
    
    const [tables] = await db.sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    tables.forEach(table => console.log(`  - ${table.table_name}`));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await db.sequelize.close();
  }
}

syncDatabase();
