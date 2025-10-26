require('dotenv').config();

module.exports ={
  port: process.env.PORT || 3000,
  database: process.env.DATABASE_NAME,
  username: process.env.DB_USER,
  password: process.env.PASSWORD,
  [process.env.NODE_ENV || 'development']: {
    username: process.env.DB_USER,
    password: process.env.PASSWORD,
    database: process.env.DATABASE_NAME,
    host: process.env.HOSTNAME,
    dialect: 'postgres',
    port: process.env.DB_PORT || '5432',
    dialectOptions: {
      ssl:
        process.env.NODE_ENV === 'production'
          ? {
              rejectUnauthorized: false
            }
          : false
    }
  },
  databaseConfigs: {
    host: process.env.HOSTNAME || 'localhost',
    dialect: 'postgres',
    port: process.env.DB_PORT || '5432',
    dialectOptions: {
      ssl:
        process.env.NODE_ENV === 'production'
          ? {
              rejectUnauthorized: false
            }
          : false
    }
  }
}