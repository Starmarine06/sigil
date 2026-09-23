import { stripCodeFences } from "../nlp/token.js";

/**
 * "Where did it leave off?" — the part a portability/handoff reader needs most:
 * the last ask and the immediate next steps from the FINAL assistant turns.
 * Cues are line-based and fence-aware (code comments are not next steps).
 */
const CUE = [
  { re: /^(?:then|finally|next|after that|now)\s+[^.!?\n]{4,160}/i, name: "sequencing cue" },
  { re: /\b(?:you'?ll|you will|we'?ll|we will)\s+(?:want to|need to|should|have to|must)\s+[^.!?\n]{4,160}/i, name: "required action" },
  { re: /\b(?:don'?t forget|remember to|make sure|confirm|verify|double[- ]?check)\s+[^.!?\n]{4,160}/i, name: "verification cue" },
  { re: /^(?:reload|restart|rebuild|rerun|test|try|run|install|write|add|create|commit|push)\s+[^.!?\n]{4,160}/i, name: "imperative cue" },
];

const MAX_STEPS = 6;
const FILLER_TAIL = /(?:\bthanks?\b|\bthx\b)\s*[.!]?\s*$/i;

export function extractCurrentState(messages, { tailTurns = 3 } = {}) {
  const assistants = messages.filter((m) => m.role === "assistant");
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const tailAssistants = assistants.slice(-tailTurns);

  let nextSteps = [];
  const count = tailAssistants.length;
  if (tailAssistants.length) {
    const firstTurn = tailAssistants[0].turn;
    const tail = messages.filter((m) => m.turn >= firstTurn);
    nextSteps = scanTail(tail);
  }

  return {
    count,
    lastAsk: lastUser
      ? {
          text: cap(stripCodeFences(lastUser.text).replace(/\s+/g, " ").trim(), 300),
          turn: lastUser.turn,
        }
      : null,
    nextSteps,
  };
}

function scanTail(tail) {
  const found = [];
  const seen = new Set();
  for (const msg of tail) {
    if (msg.role !== "assistant") continue;
    let inFence = false;
    for (const rawLine of msg.text.replace(/\r/g, "").split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^```/.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      for (const { re, name } of CUE) {
        if (!re.test(line)) continue;
        const item = line
          .replace(/^[*#>\s]+|[*#\s]+$/g, "")
          .replace(/\s+/g, " ")
          .replace(FILLER_TAIL, "").trim();
        if (!item || item.length > 200) break;
        const key = item.toLowerCase();
        if (seen.has(key)) break;
        seen.add(key);
        found.push({ text: item, rule: name, turn: msg.turn, role: "assistant" });
        break;
      }
    }
    if (found.length >= MAX_STEPS) break;
  }
  return found.slice(0, MAX_STEPS);
}

function cap(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}