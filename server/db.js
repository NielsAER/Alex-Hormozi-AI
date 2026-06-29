import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

// Replit / Neon en de meeste managed Postgres-instanties vereisen SSL.
// Lokale databases (localhost) draaien doorgaans zonder.
const needsSsl =
  !!connectionString && !/localhost|127\.0\.0\.1/.test(connectionString);

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
