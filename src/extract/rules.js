/**
 * Cue-rule extraction producing explainable items.
 * Every result carries { text, turn, role, rule } so the context doc can
 * cite where each decision / requirement / action came from.
 * `rule` is always a human-readable evidence label, never a regex literal.
 */
import { sentences, stripCodeFences } from "../nlp/token.js";

const RULES = [
  {
    key: "decisions",
    label: "decision",
    scope: "both",
    re: [
      { re: /\b(?:decided|decision|decide|decided on|decision is|we decided)\b/i, name: "explicit decision wording" },
      { re: /\b(?:going with|go with|we'?re using|we'?ll use|we will use|let'?s use|i'?ll use|let'?s go with)\b/i, name: "choice phrasing" },
      { re: /^(?:use|adopt|standardize on|stick with|switch to|move to|start with|switch over to)\s+\S/i, name: "adoption wording" },
      { re: /\b(?:prefer(?:red)?|choice is|chose|chosen)\b/i, name: "preference wording" },
      { re: /\b(?:agreed to|settled on|landed on)\b/i, name: "agreement wording" },
    ],
  },
  {
    key: "requirements",
    label: "requirement",
    scope: "user",
    re: [
      { re: /\bmust\b|\bshould\b|\bneeds?\s+to\b|\brequires?\b|\bis required\b|\bhas to\b|\bhas got to\b/i, name: "must/should wording" },
      { re: /^(?:must|should|need|required|please)\b/i, name: "requirement opening" },
      { re: /\bmust not\b|\bshould not\b|\bcannot\b|\bcan'?t\b/i, name: "prohibition wording" },
    ],
  },
  {
    key: "actions",
    label: "action",
    scope: "assistant",
    re: [
      { re: /^(?:next step|next|then|after that|afterwards|finally|follow[- ]?up|todo|to[- ]do|remaining|left to do|before you)\b/i, name: "next-step wording" },
      { re: /\b(?:next step|next thing|follow[- ]?up|then)\s+(?:is|to|we|you)\b/i, name: "sequencing wording" },
      { re: /\b(?:we still need|you still need|still need to|next we)\b/i, name: "remaining-work wording" },
    ],
  },
  {
    key: "requests",
    label: "request",
    scope: "user",
    re: [
      { re: /^(?:can you|could you|please|i want you to|i need you to|help me|build|create|make|write|refactor|fix|implement|add|convert|migrate)\b/i, name: "directive wording" },
      { re: /^(?:how (?:do|can|should) i|where does|what is the (?:best|easiest)|what'?s the (?:best|easiest))\b/i, name: "how-to wording" },
    ],
  },
];

const FILLER_TAIL = /(?:\bthanks?\b|thank you|\bcheers\b|\bthx\b)\s*[.!]?\s*$/i;
const LINEBREAK_NOISE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const TINY = /^(?:hi|hello|ok|okay|great|perfect|got it|sounds good|yes|no|see below)\b[.!,\s]*$/i;
const REQUIREMENT_LINE = /\b(?:must|should|needs?\s+to|requires?|required|cannot|can'?t|has to|must not|should not)\b/i;

/**
 * Messages longer than this are too code- and heading-heavy to safely mine a
 * "decision happened mid-paragraph" from prose shape; line-level cues already
 * cover the readable lines in those cases.
 */
const MID_PARA_MAX_CHARS = 600;

export function extractRules(messages) {
  const out = { decisions: [], requirements: [], actions: [], requests: [] };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const role = msg.role;
    const text = msg.text.replace(/\r/g, "");
    const lines = text.split("\n");

    for (const rule of RULES) {
      if (rule.scope !== "both" && rule.scope !== role) continue;
      const bucket = out[rule.key];
      const found = matchLines(rule, lines, role, i);
      for (const item of found) bucket.push(item);
    }
  }

  for (const key of Object.keys(out)) out[key] = dedupe(out[key]);
  return out;
}

function matchLines(rule, lines, role, turn) {
  const found = [];
  const seen = new Set();
  let lineHit = false;

  const push = (raw, ruleName) => {
    let item = raw.replace(/^[*#>\s]+|[*#\s]+$/g, "").trim();
    if (!item) return;
    item = item.replace(/\s+/g, " ").replace(FILLER_TAIL, "").trim();
    if (!item || item.length > 400) return;
    if (TINY.test(item) || LINEBREAK_NOISE.test(item)) return;
    if (seen.has(item.toLowerCase())) return;
    seen.add(item.toLowerCase());
    found.push({ text: item, role, turn, rule: ruleName });
  };

  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue; // cue words inside code blocks are not decisions

    if (/^\s*[-*]\s*\[[ xX]?]\s*.+/i.test(trimmed)) {
      push(lines[i], "task-list item");
      continue;
    }
    if (rule.key === "requirements" && /^\s*[-*•]\s+/.test(trimmed) && role === "user") {
      push(lines[i], "user bullet");
      continue;
    }
    if (rule.key === "actions" && /^\s*\d+[.)]\s+/.test(trimmed) && role === "assistant") {
      push(lines[i], "numbered step");
      continue;
    }
    for (const { re, name } of rule.re) {
      const testRe = re.source.startsWith("^") ? re : new RegExp(`(?:^|[;\\n])${re.source}`, re.flags);
      const test = new RegExp(testRe.source, testRe.flags);
      if (test.test(trimmed)) {
        if (rule.key === "requirements" && role === "user") {
          // A requirement line may contain several sentences; keep each sentence
          // that still names a requirement so "must X. should Y." yields 2 items.
          const sents = sentences(trimmed);
          if (sents.length > 1) {
            let pushedAny = false;
            for (const s of sents) {
              if (REQUIREMENT_LINE.test(s)) {
                push(s, name);
                pushedAny = true;
              }
            }
            if (!pushedAny) push(trimmed, name);
            break;
          }
        }
        push(trimmed, name);
        lineHit = true;
        break;
      }
    }
  }

  // Mid-paragraph decisions/actions: only when no single line carried the cue
  // AND the message is short enough to be prose, not fenced/tabular content.
  // The matched sentence replaces the old raw character slice, so evidence is
  // never a half-code, half-prose fragment.
  if (!lineHit && rule.key === "decisions") {
    const prose = stripCodeFences(lines.join(" ")).replace(/\s+/g, " ").trim();
    if (prose.length > 0 && prose.length <= MID_PARA_MAX_CHARS) {
      const sents = sentences(prose);
      for (const { re, name } of rule.re) {
        const hit = sents.find((s) => re.test(s));
        if (hit) push(hit, name);
      }
    }
  }

  return found;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((x) => {
    const k = x.text.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}