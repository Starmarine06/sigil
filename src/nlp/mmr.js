import { significantTokens } from "./token.js";
import { bagOfWords, cosine } from "./vectors.js";

/**
 * MMR — Maximal Marginal Relevance (Carbonell & Goldstein 1998).
 * Greedily picks high-relevance sentences while penalizing redundancy
 * against already-selected ones, so the highlights cover all topics.
 *
 * Returns [{ index, mmr }] picks in selection order.
 */
export function mmr(sentences, scores, { lambda = 0.7, topN = 6 } = {}) {
  const n = sentences.length;
  if (n === 0) return [];
  const bags = sentences.map((s) => bagOfWords(significantTokens(s)));
  const sims = [];
  for (let i = 0; i < n; i++) {
    sims.push(new Array(n).fill(0));
    for (let j = 0; j < i; j++) {
      const s = cosine(bags[i], bags[j]);
      sims[i][j] = s;
      sims[j][i] = s;
    }
  }

  const selected = new Set();
  const picks = [];
  const k = Math.min(topN, n);
  for (let t = 0; t < k; t++) {
    let best = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < n; i++) {
      if (selected.has(i)) continue;
      let maxSim = 0;
      for (const j of selected) {
        if (sims[i][j] > maxSim) maxSim = sims[i][j];
      }
      const val = lambda * (scores[i] || 0) - (1 - lambda) * maxSim;
      if (val > bestVal) {
        bestVal = val;
        best = i;
      }
    }
    if (best < 0) break;
    selected.add(best);
    picks.push({ index: best, mmr: Math.round(bestVal * 1000) / 1000 });
  }
  return picks;
}