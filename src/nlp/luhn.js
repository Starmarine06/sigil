import { significantTokens } from "./token.js";

/**
 * Luhn's 1958 word-significance scoring. Words appearing >=2 times are
 * "significant"; each sentence is scored by the best window of at most
 * `maxWidth` tokens containing >=2 significant words: (sigCount^2 / width).
 * Returns scores aligned to input texts.
 */
export function luhn(texts, { maxWidth = 6 } = {}) {
  const freq = new Map();
  for (const t of texts) {
    for (const w of significantTokens(t)) freq.set(w, (freq.get(w) || 0) + 1);
  }
  const significant = (w) => (freq.get(w) || 0) >= 2;

  return texts.map((t) => {
    const toks = significantTokens(t);
    if (toks.length < 2) return 0;
    let best = 0;
    for (let i = 0; i < toks.length; i++) {
      let sig = 0;
      for (let j = i; j < toks.length && j - i < maxWidth; j++) {
        if (significant(toks[j])) sig++;
        if (sig >= 2) {
          const width = j - i + 1;
          const score = (sig * sig) / width;
          if (score > best) best = score;
        }
      }
    }
    return best;
  });
}