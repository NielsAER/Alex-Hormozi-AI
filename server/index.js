import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

import { pool, initDb, toVector } from './db.js';
import { embedOne } from './embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const CLIENT_DIST = path.resolve(__dirname, '..', 'client', 'dist');

const MODEL = 'claude-sonnet-4-6';
const TOP_K = 6;
const MAX_TOKENS = 2048;

let anthropic;
function getAnthropic() {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY ontbreekt. Stel deze in via Replit Secrets of je .env-bestand.'
      );
    }
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

// Velden van het bedrijfsprofiel (volgorde + labels voor de system prompt).
const PROFILE_FIELDS = [
  ['naam', 'Bedrijfsnaam'],
  ['aanbod', 'Aanbod / product / dienst'],
  ['doelgroep', 'Ideale klant / doelgroep'],
  ['prijzen', 'Prijzen / pakketten'],
  ['cijfers', 'Belangrijke cijfers (omzet, marge, klanten, CAC/LTV)'],
  ['doelen', 'Doelen'],
  ['knelpunt', 'Grootste knelpunt op dit moment'],
  ['extra', 'Overige context'],
];

function formatProfile(profile) {
  const lines = PROFILE_FIELDS.filter(
    ([key]) => profile && profile[key] && String(profile[key]).trim()
  ).map(([key, label]) => `- ${label}: ${String(profile[key]).trim()}`);
  return lines.length > 0
    ? lines.join('\n')
    : '(De gebruiker heeft het bedrijfsprofiel nog niet ingevuld.)';
}

async function getProfile() {
  try {
    const { rows } = await pool.query('SELECT data FROM business_profile WHERE id = 1');
    return rows[0]?.data || {};
  } catch {
    return {};
  }
}

function buildSystemPrompt(profileBlock, contextBlock) {
  return `Je bent een scherpe business mentor in de stijl van Alex Hormozi: direct, no-nonsense, alles onderbouwd met logica en getallen. Je baseert je advies op de Hormozi-principes uit de knowledge base en stemt het ALTIJD concreet af op het bedrijfsprofiel van de gebruiker hieronder: gebruik hun aanbod, prijzen, cijfers en knelpunt in je antwoord. Verzin geen feiten die niet in de context of het profiel staan; als iets ontbreekt, zeg dat eerlijk of vraag erom. Antwoord in het Nederlands, beknopt en met concrete, uitvoerbare stappen.

PROFIEL VAN HET BEDRIJF VAN DE GEBRUIKER:
${profileBlock}

CONTEXT UIT KNOWLEDGE BASE:
${contextBlock}`;
}

const app = express();
app.use(cors({ exposedHeaders: ['X-Sources'] }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Bedrijfsprofiel ophalen en opslaan.
app.get('/api/profile', async (_req, res) => {
  try {
    res.json(await getProfile());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/profile', async (req, res) => {
  try {
    const incoming = req.body && typeof req.body === 'object' ? req.body : {};
    // Alleen bekende velden bewaren.
    const data = {};
    for (const [key] of PROFILE_FIELDS) {
      if (incoming[key] != null) data[key] = String(incoming[key]);
    }
    await pool.query(
      `INSERT INTO business_profile (id, data, updated_at) VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET data = $1::jsonb, updated_at = now()`,
      [JSON.stringify(data)]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages (array) is verplicht.' });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser || !lastUser.content) {
      return res.status(400).json({ error: 'Geen gebruikersvraag gevonden.' });
    }

    // 1. Embed de vraag.
    const queryEmbedding = await embedOne(lastUser.content);

    // 2. Haal de top-K meest relevante chunks op via cosine similarity.
    const { rows } = await pool.query(
      `SELECT source, content, 1 - (embedding <=> $1) AS similarity
         FROM documents
        ORDER BY embedding <=> $1
        LIMIT $2`,
      [toVector(queryEmbedding), TOP_K]
    );

    const contextBlock =
      rows.length > 0
        ? rows
            .map((r) => `[Bron: ${r.source}]\n${r.content}`)
            .join('\n\n---\n\n')
        : '(Geen relevante context gevonden in de knowledge base.)';

    const sources = [...new Set(rows.map((r) => r.source))];

    // Laad het bedrijfsprofiel zodat elk antwoord persoonlijk is.
    const profileBlock = formatProfile(await getProfile());

    // 3 & 4. Stuur context als system prompt mee, samen met de volledige geschiedenis.
    const conversation = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: String(m.content) }));

    // Geef de gebruikte bronnen mee in een header (vóór de stream begint).
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Sources', encodeURIComponent(JSON.stringify(sources)));
    res.setHeader('Cache-Control', 'no-cache');

    // 5. Stream het antwoord van Claude terug.
    const stream = getAnthropic().messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(profileBlock, contextBlock),
      messages: conversation,
    });

    stream.on('text', (delta) => res.write(delta));
    await stream.finalMessage();
    res.end();
  } catch (err) {
    console.error('Fout in /api/chat:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  }
});

// Serveer de gebouwde frontend in productie (na `npm run build`).
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

async function start() {
  // Probeer de DB te initialiseren met een paar retries — handig wanneer de
  // database-container nog aan het opstarten is.
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await initDb();
      console.log('🗄️   Database klaar (pgvector + documents-tabel).');
      break;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error('⚠️  Kon database niet initialiseren:', err.message);
      } else {
        console.log(`⏳  Wacht op database (poging ${attempt}/${maxAttempts})...`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  app.listen(PORT, () => {
    console.log(`🚀  Server draait op http://localhost:${PORT}`);
  });
}

start();
