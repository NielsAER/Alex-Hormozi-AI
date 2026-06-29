# Hormozi Mentor — AI Business Coach (RAG)

Een AI business mentor in de stijl van Alex Hormozi. De app grondt alle antwoorden in een
eigen knowledge base met **retrieval-augmented generation (RAG)**: je vraag wordt geëmbed,
de meest relevante stukken uit jouw documenten worden opgehaald, en Claude antwoordt
uitsluitend op basis van die context.

## Stack

- **Backend:** Node.js + Express
- **Frontend:** React (Vite) — donker thema, oranje accent (`#ff4f00`)
- **LLM:** Anthropic Claude (`claude-sonnet-4-6`) via `@anthropic-ai/sdk` (streaming)
- **Embeddings:** OpenAI `text-embedding-3-small`
- **Vector-opslag:** PostgreSQL met de `pgvector`-extensie

## 1. Secrets instellen

De app heeft drie secrets nodig. Op **Replit** zet je deze onder **Tools → Secrets**;
lokaal kopieer je `.env.example` naar `.env` en vul je ze in.

| Variabele           | Waar vandaan                                              |
| ------------------- | -------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/                           |
| `OPENAI_API_KEY`    | https://platform.openai.com/                             |
| `DATABASE_URL`      | Replit: automatisch na het toevoegen van een PostgreSQL-database |

> **Replit:** open het paneel **Database** (of **Tools → PostgreSQL**) en klik op
> *Create a database*. `DATABASE_URL` wordt dan automatisch als secret beschikbaar.
> De `pgvector`-extensie en de `documents`-tabel worden automatisch aangemaakt bij het
> draaien van het ingest-script of de server.

## 2. Installeren

```bash
npm run install:all
```

Dit installeert zowel de backend- als de frontend-dependencies.

## 3. Documenten toevoegen

Zet je bestanden (`.md`, `.txt`, `.pdf`) in de map [`/knowledge`](./knowledge).
Er staan al twee voorbeeldbestanden in zodat je meteen kunt testen.

## 4. Knowledge base inladen (ingest)

```bash
npm run ingest
```

Dit script:

1. leest alle `.md`/`.txt`/`.pdf` bestanden uit `/knowledge` (PDF's via `pdf-parse`);
2. deelt de tekst op in chunks van ~500 tokens met ~50 tokens overlap;
3. genereert per chunk een embedding;
4. slaat chunks + embeddings + bronbestandsnaam op in de `documents`-tabel (pgvector).

Het script is **idempotent**: bij opnieuw draaien wordt de tabel eerst geleegd, dus je krijgt
nooit duplicaten. Draai het opnieuw telkens wanneer je documenten toevoegt of wijzigt.

## 5. De app starten

**Ontwikkeling** (backend + Vite dev-server met hot reload):

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:3001 (Vite proxyt `/api` hier automatisch naartoe)

**Productie** (frontend bouwen, daarna door de Express-server serveren):

```bash
npm run build
npm start
```

De volledige app draait dan op http://localhost:3001 (of de `PORT` uit je omgeving — op
Replit wordt deze automatisch gezet).

## Hoe het werkt

- **`POST /api/chat`** ontvangt de volledige gespreksgeschiedenis. De laatste gebruikersvraag
  wordt geëmbed, de top 6 meest relevante chunks worden via cosine similarity (`pgvector`)
  opgehaald en als context in de system prompt meegegeven. Claude streamt het antwoord terug.
- De gebruikte **bronbestanden** worden via de `X-Sources`-header meegestuurd en onder elk
  AI-antwoord getoond.

## Projectstructuur

```
knowledge/            ← jouw .md/.txt/.pdf bestanden
server/
  index.js            ← Express-server + /api/chat (streaming)
  ingest.js           ← npm run ingest
  db.js               ← pg pool, schema, pgvector helpers
  embeddings.js       ← OpenAI embeddings
  chunk.js            ← tekst opdelen in chunks
client/               ← React (Vite) frontend
```
