/**
 * Jest global setup — runs once before all test files.
 * Sets required environment variables so auth.js and other modules
 * that call process.exit() on missing env don't abort the test run.
 */
module.exports = async function globalSetup() {
    process.env.JWT_SECRET = 'test-secret-for-jest-minimum-32-characters-long-ok';
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.DATABASE_NAME = 'customerInvoice_test';
    process.env.DB_USER = 'postgres';
    process.env.PASSWORD = 'test';
    process.env.DB_HOST = '127.0.0.1';
    process.env.NODE_ENV = 'test';
};
