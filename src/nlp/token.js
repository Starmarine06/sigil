import { STOPWORDS } from "./stopwords.js";

const WORD_RE = /[A-Za-z][A-Za-z0-9_'-]*/g;

/** Lowercased word tokens (keeps numbers-ish words). */
export function wordTokens(text) {
  if (!text) return [];
  const m = text.match(WORD_RE);
  return m ? m.map((w) => w.toLowerCase()) : [];
}

/** Word tokens with stopwords and 1-char tokens removed. */
export function significantTokens(text) {
  return wordTokens(text).filter((w) => !STOPWORDS.has(w) && w.length > 1);
}

const FENCE_RE = /```[\w.+-]*\r?\n[\s\S]*?```/g;

/**
 * Removes fenced code blocks so prose-level NLP (RAKE, topics, sentences)
 * never tokenizes code as if it were natural language. Unterminated fences
 * drop everything from the opening fence to the end of the message.
 *
 * `marker` replaces each removed block (default: nothing, i.e. a single space
 * so adjacent words don't merge). Pass " [code] " to keep a visible boundary.
 */
export function stripCodeFences(text, marker = " ") {
  if (!text) return "";
  let s = text.replace(FENCE_RE, marker);
  if (/```/.test(s)) s = s.replace(/```[\w.+=-]*[^\n]*\n?[\s\S]*$/, marker);
  return s;
}

/**
 * Sentence splitter tuned for chat/prose.
 * Paragraphs and newlines bound sentences; long prose splits on ". Next".
 */
export function sentences(text) {
  if (!text) return [];
  const out = [];
  for (const para of text.split(/\r?\n\s*\r?\n/)) {
    for (const chunk of para.split(/\r?\n/)) {
      const sents = chunk
        .replace(/([.!?])\s+(?=[A-Z0-9"'(])/g, "$1\n")
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 1);
      out.push(...sents);
    }
  }
  return out;
}