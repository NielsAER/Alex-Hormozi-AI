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

// Postgres text-search configuratie (Nederlands voor stemming van NL-vragen).
export const TS_CONFIG = 'dutch';

/**
 * Zorgt dat de tabellen bestaan. Idempotent: veilig om vaker aan te roepen.
 * Gebruikt PostgreSQL full-text search (geen externe embeddings nodig).
 */
export async function initDb() {
  // Migratie: een oudere documents-tabel gebruikte een vector-kolom (embeddings).
  // Die opzet is vervangen door full-text search; gooi de oude tabel weg zodat hij
  // opnieuw met het juiste schema wordt aangemaakt. De inhoud komt terug via ingest.
  const hasEmbedding = await pool.query(`
    SELECT 1
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
     WHERE c.relname = 'documents' AND a.attname = 'embedding'
  `);
  if (hasEmbedding.rows.length > 0) {
    console.log(
      "🔁  Oude embeddings-tabel gevonden; documents wordt opnieuw aangemaakt voor full-text search. Draai daarna opnieuw 'npm run ingest'."
    );
    await pool.query('DROP TABLE documents');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id         SERIAL PRIMARY KEY,
      source     TEXT NOT NULL,
      content    TEXT NOT NULL,
      tsv        tsvector GENERATED ALWAYS AS (to_tsvector('${TS_CONFIG}', content)) STORED,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS documents_tsv_idx ON documents USING GIN (tsv)'
  );

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
