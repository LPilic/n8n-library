const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, prepareDatabase } = require('./test-db');
const { runMigrations, MIGRATION_VERSION } = require('../migrate');

test.before(async () => {
  await prepareDatabase();
});

test.after(async () => {
  await pool.end();
});

test('migrations are versioned and idempotent', async () => {
  await runMigrations(); // second run in this process
  const { rows } = await pool.query(
    'SELECT version FROM schema_migrations WHERE version = $1',
    [MIGRATION_VERSION]
  );
  assert.equal(rows.length, 1);

  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name IN ('users', 'tickets', 'kb_articles', 'hitl_requests', 'credential_store')
  `);
  assert.equal(tables.rows.length, 5);
});
