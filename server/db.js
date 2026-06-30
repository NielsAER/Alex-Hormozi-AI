import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

// SSL staat standaard UIT (zelf-gehoste Postgres, Docker, lokaal hebben dat niet).
// Zet hem aan met DATABASE_SSL=true (of require) of via ?sslmode=require in de URL
// als je een managed database gebruikt die SSL vereist.
const sslEnv = (process.env.DATABASE_SSL || '').toLowerCase();
const needsSsl =
  sslEnv === 'true' ||
  sslEnv === 'require' ||
  /sslmode=require/.test(connectionString || '');

export const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
});

// Dimensie van OpenAI text-embedding-3-small
export const EMBEDDING_DIM = 1536;

/**
 * Zorgt dat de pgvector-extensie en de documents-tabel bestaan.
 * Idempotent: veilig om vaker aan te roepen.
 */
export async function initDb() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id         SERIAL PRIMARY KEY,
      source     TEXT NOT NULL,
      content    TEXT NOT NULL,
      embedding  vector(${EMBEDDING_DIM}),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
}

/** Zet een JS-array om naar het pgvector literal-formaat: [1,2,3]. */
export function toVector(arr) {
  return `[${arr.join(',')}]`;
}
