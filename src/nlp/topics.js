import { significantTokens } from "./token.js";
import { bagOfWords, cosine } from "./vectors.js";
import { rake } from "./rake.js";

/**
 * TextTiling-lite: segments an ordered list of item texts into cohesive
 * topics by finding local minima in inter-item lexical cohesion.
 * Items are message turns; returns [{ start, end, label, size }]
 * where start/end are inclusive indices into the input `items` array.
 */
export function segmentTopics(items, { gapFactor = 0.8 } = {}) {
  const n = items.length;
  if (n < 2) return [{ start: 0, end: 0, label: "", size: 1 }];

  const sims = [];
  for (let i = 1; i < n; i++) {
    const prev = bagOfWords(significantTokens(items[i - 1]));
    const cur = bagOfWords(significantTokens(items[i]));
    sims.push(cosine(prev, cur));
  }
  const mean = sims.reduce((a, b) => a + b, 0) / sims.length;
  if (mean === 0) return [{ start: 0, end: n - 1, label: "", size: n }];

  const gaps = []; // gap at position i means boundary between item i and i+1
  for (let i = 0; i < sims.length; i++) {
    if (sims[i] >= mean * gapFactor) continue;
    const left = i - 1 >= 0 ? sims[i - 1] : Infinity;
    const right = i + 1 < sims.length ? sims[i + 1] : Infinity;
    if (sims[i] <= left && sims[i] <= right) gaps.push(i);
  }

  // Merge tiny gaps into segments of < 3 items on either side.
  const bounds = [0];
  for (const g of gaps) {
    const prevBound = bounds[bounds.length - 1];
    if (g + 1 - prevBound < 2 && bounds.length > 1) continue;
    bounds.push(g + 1);
  }
  if (bounds[bounds.length - 1] !== n) bounds.push(n);

  const segments = [];
  for (let k = 0; k < bounds.length - 1; k++) {
    const start = bounds[k];
    const end = bounds[k + 1] - 1;
    if (end < start) continue;
    const slice = items.slice(start, end + 1).join(" ");
    const phrase = rake(slice, { topN: 1 })[0];
    segments.push({
      start,
      end,
      size: end - start + 1,
      label: phrase ? phrase.phrase : "",
    });
  }
  return segments;
}