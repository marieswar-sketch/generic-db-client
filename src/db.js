import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

function getSslConfig() {
  return process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false;
}

export function getDbPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required. Copy .env.example to .env and set it.');
  }

  return new Pool({
    connectionString,
    ssl: getSslConfig()
  });
}

export async function runQuery(text, params = []) {
  const pool = getDbPool();

  try {
    return await pool.query(text, params);
  } finally {
    await pool.end();
  }
}
