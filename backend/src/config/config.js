require('dotenv').config();

const common = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  dialect: 'postgres',
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false
  }
};

module.exports = {
  development: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.PASSWORD || '',
    database: process.env.DATABASE_NAME || 'customerInvoice',
    ...common
  },
  test: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.PASSWORD || '',
    database: process.env.DATABASE_NAME || 'customerInvoice_test',
    ...common
  },
  production: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.PASSWORD || '',
    database: process.env.DATABASE_NAME || 'customerInvoice_prod',
    ...common
  }
};
