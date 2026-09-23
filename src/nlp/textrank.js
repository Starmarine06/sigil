import { significantTokens } from "./token.js";
import { bagOfWords, cosine } from "./vectors.js";

/**
 * TextRank-style sentence centrality (Mihalcea & Tarau 2004).
 * Builds a word-overlap similarity graph between sentences and runs
 * power iteration until convergence. Fully deterministic; no model.
 *
 * Returns { scores, links } aligned to the input `sentences` array.
 *   scores[i] : stationary centrality of sentence i (mass is conserved only
 *               when every sentence links to another; isolated sentences ~0.15)
 *   links[i]  : number of other sentences sentence i shares words with
 */
export function textrank(sentences, { damping = 0.85, maxIter = 200, tol = 1e-6 } = {}) {
  const n = sentences.length;
  if (n === 0) return { scores: [], links: [] };

  const bags = sentences.map((s) => bagOfWords(significantTokens(s)));
  const sim = [];
  for (let i = 0; i < n; i++) sim.push(new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = cosine(bags[i], bags[j]);
      sim[i][j] = s;
      sim[j][i] = s;
    }
  }

  // Row-normalized weights + link counts.
  const rowSum = new Array(n).fill(0);
  const links = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let lnk = 0;
    for (let j = 0; j < n; j++) {
      if (sim[i][j] > 0) lnk++;
      sum += sim[i][j];
    }
    rowSum[i] = sum;
    links[i] = lnk;
  }

  let score = new Array(n).fill(1 / n);
  for (let iter = 0; iter < maxIter; iter++) {
    const next = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let acc = 1 - damping;
      for (let j = 0; j < n; j++) {
        if (sim[j][i] > 0 && rowSum[j] > 0) {
          acc += (damping * sim[j][i] * score[j]) / rowSum[j];
        }
      }
      next[i] = acc;
    }
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(next[i] - score[i]);
    score = next;
    if (diff < tol) break;
  }

  return { scores: score, links };
}