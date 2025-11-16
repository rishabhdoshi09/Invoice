// backend/src/models/index.js
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const SequelizeLib = require('sequelize'); // library
const basename = path.basename(__filename);

// Try to require config from common locations (adjust if your config is elsewhere)
let config;
try {
  config = require(path.join(__dirname, '..', 'config', 'config.js'));
} catch (e1) {
  try {
    config = require(path.join(__dirname, '..', '..', 'config.js'));
  } catch (e2) {
    try {
      config = require(path.join(__dirname, '..', '..', 'config', 'index.js'));
    } catch (e3) {
      console.error('Could not load DB config file. Checked several locations.');
      throw e3;
    }
  }
}

const env = process.env.NODE_ENV || 'development';

// Support both shapes:
// 1) config = { development: { ... }, production: {...} }
// 2) config = { username, password, database, databaseConfigs, ... }
let dbConfig;
if (config[env]) {
  dbConfig = config[env];
} else if (config.database && (config.username || process.env.DB_USER)) {
  dbConfig = {
    username: config.username || process.env.DB_USER,
    password: config.password || process.env.PASSWORD,
    database: config.database || process.env.DATABASE_NAME,
    host: (config.host || config.databaseConfigs?.host) || process.env.DB_HOST || '127.0.0.1',
    port: config.port || config.databaseConfigs?.port || process.env.DB_PORT || 5432,
    dialect: config.dialect || config.databaseConfigs?.dialect || 'postgres',
    dialectOptions: config.dialectOptions || config.databaseConfigs?.dialectOptions || {}
  };
} else {
  throw new Error('Invalid DB config shape. Please export either { development: {...} } or flat { username, password, database, databaseConfigs }');
}

// Ensure types
dbConfig.port = Number(dbConfig.port) || 5432;
if (!dbConfig.dialect) dbConfig.dialect = 'postgres';

// Debug — remove or set SQL_LOG=true in .env for verbose
console.log('DB config used:', {
  username: dbConfig.username,
  database: dbConfig.database,
  host: dbConfig.host,
  port: dbConfig.port,
  dialect: dbConfig.dialect
});

// Build Sequelize instance with explicit args (guarantees dialect is provided)
const sequelize = new SequelizeLib(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    dialectOptions: dbConfig.dialectOptions || {},
    logging: process.env.SQL_LOG === 'true' ? console.log : false
  }
);

const db = {};

// Use glob to load model files
const files = glob.sync(path.join(__dirname, '**', '*.js'));

for (const file of files) {
  const base = path.basename(file);
  if (base === basename) continue; // skip this file
  if (base.startsWith('.')) continue; // skip hidden files
  if (path.extname(base) !== '.js') continue;

  const modelName = path.basename(base, '.js');

  try {
    const modelFactory = require(file);
    if (typeof modelFactory === 'function') {
      db[modelName] = modelFactory(sequelize, SequelizeLib.DataTypes || SequelizeLib);
    } else if (modelFactory && modelFactory.name) {
      db[modelName] = modelFactory;
    } else {
      console.warn(`Model file ${file} did not export a function or model instance; skipping.`);
    }
  } catch (err) {
    console.error(`Failed to load model "${modelName}" from ${file}:`, err);
  }
}

// Call associate if present
Object.keys(db).forEach((modelName) => {
  if (db[modelName] && typeof db[modelName].associate === 'function') {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = SequelizeLib;

module.exports = db;
