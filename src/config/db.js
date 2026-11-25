const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// Return NUMERIC columns (money, quantities stored as NUMERIC) as JS numbers
// instead of node-postgres's default string representation.
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

const connectionString =
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

function missingDatabaseError() {
  return new Error(
    'No Postgres connection string found. Set POSTGRES_URL (or DATABASE_URL) in Vercel Environment Variables.'
  );
}

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: /localhost|127\.0\.0\.1/.test(connectionString)
        ? false
        : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : null;

let schemaReady = null;

function ensureSchema() {
  if (!pool) throw missingDatabaseError();
  if (!schemaReady) {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    schemaReady = pool.query(schema).catch((err) => {
      schemaReady = null; // allow a retry on the next call if it failed
      throw err;
    });
  }
  return schemaReady;
}

async function query(text, params) {
  await ensureSchema();
  return pool.query(text, params);
}

// For multi-statement transactions (checkout, inventory adjustments) where
// several writes must succeed or fail together. Caller is responsible for
// BEGIN/COMMIT/ROLLBACK and must always release the client.
async function getClient() {
  await ensureSchema();
  return pool.connect();
}

module.exports = { query, getClient, pool, ensureSchema };
