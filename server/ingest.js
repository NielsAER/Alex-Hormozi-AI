import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// pdf-parse rechtstreeks via lib/ importeren vermijdt de debug-harness
// die in de package-root anders een testbestand probeert te lezen.
import pdf from 'pdf-parse/lib/pdf-parse.js';

import { pool, initDb, toVector } from './db.js';
import { chunkText } from './chunk.js';
import { embed } from './embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.resolve(__dirname, '..', 'knowledge');
const SUPPORTED = new Set(['.md', '.txt', '.pdf']);
const EMBED_BATCH = 96;

async function extractText(filePath, ext) {
  if (ext === '.pdf') {
    const buffer = await readFile(filePath);
    const data = await pdf(buffer);
    return data.text;
  }
  return readFile(filePath, 'utf-8');
}

async function main() {
  console.log('🔌  Verbinden met de database en schema controleren...');
  await initDb();

  let entries;
  try {
    entries = await readdir(KNOWLEDGE_DIR, { withFileTypes: true });
  } catch {
    console.error(`❌  Map /knowledge niet gevonden op ${KNOWLEDGE_DIR}`);
    process.exit(1);
  }

  const files = entries
    .filter((e) => e.isFile() && SUPPORTED.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name);

  if (files.length === 0) {
    console.warn(
      '⚠️  Geen .md/.txt/.pdf bestanden gevonden in /knowledge. Voeg bestanden toe en draai opnieuw.'
    );
  }

  // Idempotent: leeg de tabel eerst zodat herhaald draaien geen duplicaten geeft.
  console.log('🧹  documents-tabel legen...');
  await pool.query('TRUNCATE documents RESTART IDENTITY');

  let totalChunks = 0;

  for (const name of files) {
    const filePath = path.join(KNOWLEDGE_DIR, name);
    const ext = path.extname(name).toLowerCase();
    process.stdout.write(`📄  ${name} ... `);

    let text;
    try {
      text = await extractText(filePath, ext);
    } catch (err) {
      console.log(`overgeslagen (fout bij lezen: ${err.message})`);
      continue;
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      console.log('overgeslagen (geen tekst)');
      continue;
    }

    // Embed en sla op in batches.
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const vectors = await embed(batch);

      const values = [];
      const params = [];
      batch.forEach((content, j) => {
        const base = j * 3;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
        params.push(name, content, toVector(vectors[j]));
      });

      await pool.query(
        `INSERT INTO documents (source, content, embedding) VALUES ${values.join(', ')}`,
        params
      );
    }

    totalChunks += chunks.length;
    console.log(`${chunks.length} chunks`);
  }

  console.log(`\n✅  Klaar. ${totalChunks} chunks uit ${files.length} bestand(en) opgeslagen.`);
  await pool.end();
}

main().catch(async (err) => {
  console.error('\n❌  Ingestie mislukt:', err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
