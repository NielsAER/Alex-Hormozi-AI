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
- **Deployment:** Docker Compose (app + database in containers)

---

## Deployen op je VPS met Docker (aanbevolen)

Met Docker hoef je niets handmatig te installeren behalve Docker zelf — PostgreSQL met
pgvector, de build van de frontend en de server worden allemaal automatisch geregeld.

### Vereisten op de VPS

Docker Engine + de Compose-plugin. Op een verse Ubuntu/Debian VPS:

```bash
curl -fsSL https://get.docker.com | sh
```

Controleer: `docker compose version`.

### Stap 1 — Code op de VPS zetten

```bash
git clone <jouw-repo-url> hormozi-mentor
cd hormozi-mentor
git checkout claude/hormozi-mentor-rag-app-m40skj
```

### Stap 2 — Secrets instellen

```bash
cp .env.example .env
nano .env   # vul ANTHROPIC_API_KEY en OPENAI_API_KEY in
```

`DATABASE_URL` hoef je **niet** in te vullen — Docker Compose zet die automatisch naar de
database-container. Optioneel kun je `POSTGRES_PASSWORD` zetten voor een sterker wachtwoord.

### Stap 3 — Documenten toevoegen

Zet je `.md`/`.txt`/`.pdf` bestanden in de map [`knowledge/`](./knowledge). Er staan al twee
voorbeeldbestanden in zodat je meteen kunt testen. Deze map staat op de host en wordt in de
container gemount — je kunt dus bestanden toevoegen zonder de image te herbouwen.

### Stap 4 — Bouwen en starten

```bash
docker compose up -d --build
```

Dit start twee containers: `db` (PostgreSQL + pgvector) en `app` (de webserver). De
`documents`-tabel en de pgvector-extensie worden automatisch aangemaakt.

### Stap 5 — Knowledge base inladen (ingest)

Draai het ingest-script *in* de draaiende app-container:

```bash
docker compose exec app npm run ingest
```

Dit leest alle bestanden uit `knowledge/`, deelt ze op in chunks van ~500 tokens (met ~50
overlap), genereert embeddings en slaat ze op in de database. Het script is **idempotent**:
de tabel wordt eerst geleegd, dus je krijgt nooit duplicaten.

> Draai stap 5 opnieuw telkens wanneer je documenten in `knowledge/` toevoegt of wijzigt.

### Stap 6 — Gebruiken

De app draait nu op **poort 3001** (standaard alleen op `127.0.0.1` van de VPS).

- Snel testen vanaf je eigen machine via een SSH-tunnel:
  ```bash
  ssh -L 3001:localhost:3001 gebruiker@jouw-vps-ip
  ```
  Open daarna http://localhost:3001 in je browser.
- Wil je de app **rechtstreeks publiek** bereikbaar maken op de VPS, verander dan in
  `docker-compose.yml` de regel `'127.0.0.1:3001:3001'` in `'3001:3001'` en open poort 3001
  in je firewall. (Voor een domein met HTTPS zet je later een reverse proxy zoals nginx
  ervoor — laat het weten, dan voeg ik die config toe.)

### Handige commando's

```bash
docker compose logs -f app      # live logs van de server
docker compose ps               # status van de containers
docker compose restart app      # server herstarten
docker compose down             # alles stoppen (data blijft in het pgdata-volume)
docker compose up -d --build    # opnieuw bouwen na code-wijzigingen
```

De database-data blijft bewaard in het Docker-volume `pgdata`, ook na `down`. Wil je echt
alles wissen (inclusief de database): `docker compose down -v`.

---

## Lokale ontwikkeling (zonder Docker)

Heb je Node 20+ en een eigen PostgreSQL met pgvector? Dan kun je het ook direct draaien:

```bash
npm run install:all          # installeert backend + frontend dependencies
cp .env.example .env         # vul ANTHROPIC_API_KEY, OPENAI_API_KEY en DATABASE_URL in
npm run ingest               # knowledge base inladen
npm run dev                  # backend (3001) + Vite dev-server (5173) met hot reload
```

Frontend op http://localhost:5173 (Vite proxyt `/api` automatisch naar poort 3001).

---

## Persoonlijk maken: "Mijn bedrijf"

Klik in de app rechtsboven op **Mijn bedrijf** en vul je profiel in (aanbod, prijzen, cijfers,
doelgroep, doelen, grootste knelpunt). Dit profiel wordt in de database opgeslagen en bij
**elk** antwoord automatisch meegestuurd, zodat de mentor zijn advies concreet op jouw situatie
afstemt (met jouw getallen) in plaats van algemene tips te geven.

- De **knowledge base** (`knowledge/`) levert de Hormozi-principes via RAG.
- Het **bedrijfsprofiel** levert jouw context — altijd actief, niet afhankelijk van retrieval.

## Hoe het werkt

- **`POST /api/chat`** ontvangt de volledige gespreksgeschiedenis. De laatste gebruikersvraag
  wordt geëmbed, de top 6 meest relevante chunks worden via cosine similarity (`pgvector`)
  opgehaald en samen met het bedrijfsprofiel als context in de system prompt meegegeven.
  Claude streamt het antwoord terug.
- **`GET` / `PUT /api/profile`** halen het bedrijfsprofiel op en slaan het op.
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
Dockerfile            ← bouwt frontend + draait de server
docker-compose.yml    ← app + PostgreSQL/pgvector
```
