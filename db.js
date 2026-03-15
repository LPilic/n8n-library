require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_POSTGRESDB_HOST || 'localhost',
  port: parseInt(process.env.DB_POSTGRESDB_PORT, 10) || 5432,
  user: process.env.DB_POSTGRESDB_USER || 'postgres',
  password: process.env.DB_POSTGRESDB_PASSWORD || '',
  database: process.env.DB_POSTGRESDB_DATABASE || 'n8n_library',
});

// Set search_path if a schema is configured (parameterized to prevent SQL injection)
const schema = process.env.DB_POSTGRESDB_SCHEMA || 'public';
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
  throw new Error(`Invalid DB schema name: "${schema}". Must be a valid PostgreSQL identifier.`);
}
pool.on('connect', (client) => {
  client.query(`SET search_path TO "${schema}"`);
});

module.exports = pool;
