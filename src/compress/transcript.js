import { sentences } from "../nlp/token.js";

/** Boilerplate that gets dropped from assistant prose. */
const FILLER = [
  /\bhope this helps\b/i,
  /\byou('re| are) welcome\b/i,
  /\band i('d| would) be happy to\b/i,
  /^let me know if/i,
  /^if you (have|need|want) any/i,
  /^please (let me know|feel free)/i,
  /\bas (an|a) ai/i,
  /^i('d| would) be glad to/i,
  /^feel free to/i,
  /\bdon't hesitate\b/i,
  /^no problem\b/i,
  /\bthanks for (using|asking|reaching out)\b/i,
  /\bgreat question\b/i,
  /\bcould you (share|provide|paste) (the|your|a|more)\b/i,
];

const PROSE_CAP = 700;

export { FILLER };

/**
 * Compresses the transcript deterministically:
 *  - user turns: preserved verbatim (capped at 3000 chars)
 *  - assistant turns: the TextRank/MMR-highlighted sentences + decision/action
 *    lines + all code blocks; boilerplate and filler prose dropped
 * Returns { role, turn, text, code[], truncated, highlights[] } per turn.
 */
export function compressTranscript(messages, { sentIndex, scores, picks, docs }) {
  const picksByTurn = new Map();
  for (const pick of picks) {
    const sent = sentIndex[pick.index];
    if (!sent) continue;
    const list = picksByTurn.get(sent.turn) || [];
    list.push(pick.index);
    picksByTurn.set(sent.turn, list);
  }

  const out = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({
        role: "user",
        turn: m.turn,
        text: cap(m.text, 3000),
        code: docs.filter((b) => b.turn === m.turn),
        truncated: m.text.length > 3000,
        highlights: [],
      });
    } else {
      out.push(assistantEntry(m, { sentIndex, scores, picksByTurn, docs }));
    }
  }
  return out;
}

function assistantEntry(msg, { sentIndex, scores, picksByTurn, docs }) {
  const textWithoutCode = stripCode(msg.text);
  const sents = sentences(textWithoutCode);
  const offsets = [];
  // map this turn's sentences to their global index
  for (const st of sentIndex) {
    if (st.turn === msg.turn) {
      // sentIndex entries carry their own sentence text; match by text equality
      const hit = sents.findIndex((s) => s === st.text);
      if (hit >= 0) offsets.push({ sentText: st.text, global: st.global, local: hit });
    }
  }

  const keep = [];
  const pickedGlobals = new Set(picksByTurn.get(msg.turn) || []);
  for (const o of offsets) {
    if (FILLER.some((re) => re.test(o.sentText))) continue;
    const score = scores[o.global] || 0;
    const topInTurn = offsets.filter((x) => x.global !== o.global).every((x) => score >= (scores[x.global] || 0));
    if (pickedGlobals.has(o.global) || topInTurn) {
      keep.push({ text: o.sentText, score: Math.round(score * 1000) / 1000, global: o.global });
    }
  }

  // ensure we always keep at least the first substantive (non-filler) sentence
  if (keep.length === 0 && offsets.length) {
    const first = offsets.find((o) => !FILLER.some((re) => re.test(o.sentText))) || offsets[0];
    keep.push({ text: first.sentText, score: Math.round((scores[first.global] || 0) * 1000) / 1000, global: first.global });
  }

  keep.sort((a, b) => offsets.findIndex((o) => o.global === a.global) - offsets.findIndex((o) => o.global === b.global));

  const prose = keep.map((k) => k.text).join(" ").replace(/\s+/g, " ").trim();
  const truncated = prose.length > PROSE_CAP;
  const text = truncated ? prose.slice(0, PROSE_CAP) + "… [truncated]" : prose;

  return {
    role: "assistant",
    turn: msg.turn,
    text,
    code: docs.filter((b) => b.turn === msg.turn),
    truncated,
    highlights: keep,
  };
}

function stripCode(text) {
  return text.replace(/```[\w.+=-]*\r?\n[\s\S]*?```/g, " [code block] ").replace(/\n{3,}/g, "\n\n");
}

function cap(str, n) {
  if (str.length <= n) return str;
  return str.slice(0, n) + "… [truncated]";
}