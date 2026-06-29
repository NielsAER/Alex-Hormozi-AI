// Vuistregel: ~1 token ≈ 4 tekens voor Engels/Nederlands proza.
// We mikken op chunks van ~500 tokens met ~50 tokens overlap.
const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = 500;
const OVERLAP_TOKENS = 50;

const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN; // ~2000
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN; // ~200

/**
 * Deelt tekst op in overlappende chunks op woordgrenzen.
 * @param {string} text
 * @returns {string[]} niet-lege, getrimde chunks
 */
export function chunkText(text) {
  const clean = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!clean) return [];

  const words = clean.split(/\s+/);
  const chunks = [];
  let current = [];
  let currentLen = 0;

  for (const word of words) {
    current.push(word);
    currentLen += word.length + 1;

    if (currentLen >= TARGET_CHARS) {
      chunks.push(current.join(' ').trim());

      // Bouw de overlap op vanaf het einde van de huidige chunk.
      const overlap = [];
      let overlapLen = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        overlapLen += current[i].length + 1;
        overlap.unshift(current[i]);
        if (overlapLen >= OVERLAP_CHARS) break;
      }
      current = overlap;
      currentLen = overlapLen;
    }
  }

  const tail = current.join(' ').trim();
  // Voeg de staart alleen toe als die nieuwe inhoud bevat (geen pure overlap).
  if (tail && (chunks.length === 0 || !chunks[chunks.length - 1].endsWith(tail))) {
    chunks.push(tail);
  }

  return chunks.filter(Boolean);
}
