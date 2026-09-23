import { STOPWORDS } from "./stopwords.js";

const TOKEN_RE = /[A-Za-z][A-Za-z0-9_'-]*/g;

/**
 * RAKE — Rapid Automatic Keyword Extraction (Rose et al. 2010).
 * Unsupervised keyphrase extraction. Candidate phrases are sequences of
 * tokens not separated by stopwords; word importance = degree / frequency.
 *
 * Long phrases are truncated to `maxPhraseTokens` so a dense run of rare
 * tokens (e.g. leftover identifiers) can't produce a whole-paragraph "topic".
 * Returns [{ phrase, score }] sorted by score descending.
 */
export function rake(text, { minPhraseScore = 2, topN = 15, maxPhraseTokens = 12 } = {}) {
  const raw = (text ? text.toLowerCase().match(TOKEN_RE) : []) || [];
  const isStop = (w) => STOPWORDS.has(w) || (w.length === 1 && /[0-9]/.test(w));

  const phrases = [];
  let cur = [];
  const flush = () => {
    if (cur.length) phrases.push(cur.length > maxPhraseTokens ? cur.slice(0, maxPhraseTokens) : cur);
    cur = [];
  };
  for (const w of raw) {
    if (isStop(w)) {
      flush();
    } else if (w.length > 1) {
      cur.push(w);
    }
  }
  flush();

  const freq = new Map();
  const degree = new Map();
  for (const phrase of phrases) {
    for (const w of phrase) {
      freq.set(w, (freq.get(w) || 0) + 1);
      degree.set(w, (degree.get(w) || 0) + phrase.length);
    }
  }
  const wordScore = (w) => (degree.get(w) || 0) / (freq.get(w) || 1);

  const scored = new Map();
  for (const phrase of phrases) {
    const joined = phrase.join(" ");
    let s = 0;
    for (const w of phrase) s += wordScore(w);
    scored.set(joined, Math.max(scored.get(joined) || 0, s));
  }

  return [...scored.entries()]
    .filter(([p, s]) => s >= minPhraseScore && p.length > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([phrase, score]) => ({ phrase, score: Math.round(score * 10) / 10 }));
}