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

// Dimensie van Voyage AI voyage-3
export const EMBEDDING_DIM = 1024;

/**
 * Zorgt dat de pgvector-extensie en de documents-tabel bestaan.
 * Idempotent: veilig om vaker aan te roepen.
 */
export async function initDb() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

  // Migratie: als er al een documents-tabel bestaat met een andere embedding-
  // dimensie (bijv. de oude 1536 van OpenAI), gooi die weg zodat hij opnieuw met
  // de juiste dimensie wordt aangemaakt. De inhoud wordt toch herbouwd via ingest.
  const dimCheck = await pool.query(`
    SELECT a.atttypmod AS dim
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
     WHERE c.relname = 'documents' AND a.attname = 'embedding'
  `);
  if (
    dimCheck.rows.length > 0 &&
    dimCheck.rows[0].dim !== -1 &&
    dimCheck.rows[0].dim !== EMBEDDING_DIM
  ) {
    console.log(
      `🔁  Embedding-dimensie gewijzigd (${dimCheck.rows[0].dim} → ${EMBEDDING_DIM}); documents-tabel wordt opnieuw aangemaakt. Draai daarna opnieuw 'npm run ingest'.`
    );
    await pool.query('DROP TABLE documents');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id         SERIAL PRIMARY KEY,
      source     TEXT NOT NULL,
      content    TEXT NOT NULL,
      embedding  vector(${EMBEDDING_DIM}),
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Eén-rijige tabel met het bedrijfsprofiel van de gebruiker (altijd id = 1).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_profile (
      id         INT PRIMARY KEY DEFAULT 1,
      data       JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT now(),
      CONSTRAINT business_profile_single_row CHECK (id = 1)
    )
  `);
  await pool.query(
    `INSERT INTO business_profile (id, data) VALUES (1, '{}'::jsonb)
     ON CONFLICT (id) DO NOTHING`
  );
}

/** Zet een JS-array om naar het pgvector literal-formaat: [1,2,3]. */
export function toVector(arr) {
  return `[${arr.join(',')}]`;
}
