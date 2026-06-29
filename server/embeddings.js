import OpenAI from 'openai';

export const EMBEDDING_MODEL = 'text-embedding-3-small';

let client;
function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        'OPENAI_API_KEY ontbreekt. Stel deze in via Replit Secrets of je .env-bestand.'
      );
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

/**
 * Genereer embeddings voor één string of een array van strings.
 * Geeft altijd een array van embedding-vectoren terug.
 */
export async function embed(texts) {
  const input = Array.isArray(texts) ? texts : [texts];
  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  });
  return res.data.map((d) => d.embedding);
}

/** Embed één tekst en geef de losse vector terug. */
export async function embedOne(text) {
  const [vector] = await embed(text);
  return vector;
}
