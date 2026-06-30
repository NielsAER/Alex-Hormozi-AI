// Embeddings via Voyage AI (door Anthropic aanbevolen — Claude/Anthropic biedt
// zelf geen embeddings-endpoint). We gebruiken de REST API rechtstreeks via fetch,
// zodat er geen extra dependency nodig is.

export const EMBEDDING_MODEL = 'voyage-3';
const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';

function getKey() {
  if (!process.env.VOYAGE_API_KEY) {
    throw new Error(
      'VOYAGE_API_KEY ontbreekt. Stel deze in via je .env-bestand. Haal een key op bij https://www.voyageai.com/'
    );
  }
  return process.env.VOYAGE_API_KEY;
}

/**
 * Genereer embeddings voor één string of een array van strings.
 * @param {string|string[]} texts
 * @param {'document'|'query'} inputType  Voyage optimaliseert verschillend voor
 *   documenten (ingest) en vragen (retrieval).
 * @returns {Promise<number[][]>}
 */
export async function embed(texts, inputType = 'document') {
  const input = Array.isArray(texts) ? texts : [texts];

  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getKey()}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input,
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Voyage embeddings-fout (${res.status}): ${detail}`);
  }

  const json = await res.json();
  // Sorteer op index voor de zekerheid en geef alleen de vectoren terug.
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** Embed één tekst (standaard als 'query') en geef de losse vector terug. */
export async function embedOne(text, inputType = 'query') {
  const [vector] = await embed(text, inputType);
  return vector;
}
