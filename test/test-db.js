// Test database configuration. This must run before any module requires db.js.
process.env.DB_POSTGRESDB_HOST = process.env.TEST_DB_HOST || process.env.DB_POSTGRESDB_HOST || 'localhost';
process.env.DB_POSTGRESDB_PORT = process.env.TEST_DB_PORT || process.env.DB_POSTGRESDB_PORT || '5432';
process.env.DB_POSTGRESDB_USER = process.env.TEST_DB_USER || process.env.DB_POSTGRESDB_USER || 'postgres';
process.env.DB_POSTGRESDB_PASSWORD = process.env.TEST_DB_PASSWORD ?? process.env.DB_POSTGRESDB_PASSWORD ?? '';
process.env.DB_POSTGRESDB_DATABASE = process.env.TEST_DB_DATABASE || 'n8n_library_test';
process.env.DB_POSTGRESDB_SCHEMA = process.env.TEST_DB_SCHEMA || 'public';
process.env.CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || 'ab'.repeat(32);
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-at-least-32-chars';

const pool = require('../db');
const { runMigrations } = require('../migrate');

async function prepareDatabase() {
  await runMigrations();
}

module.exports = { pool, prepareDatabase };
