/** Bag-of-words as a Map<token,count>. */
export function bagOfWords(tokens) {
  const v = new Map();
  for (const t of tokens) v.set(t, (v.get(t) || 0) + 1);
  return v;
}

/** Cosine similarity between two bag-of-words Maps. Deterministic, no model. */
export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    if (v === 0) continue;
    na += v * v;
    if (b.has(k)) dot += v * b.get(k);
  }
  for (const v of b.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}