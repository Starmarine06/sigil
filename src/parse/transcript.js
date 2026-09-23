import { toChat } from "./normalize.js";

const USER_NAMES = new Set([
  "you",
  "user",
  "human",
  "me",
  "prompt",
  "my prompt",
  "human user",
  "question",
  "input",
]);
const ASSISTANT_NAMES = new Set([
  "assistant",
  "model",
  "ai",
  "gemini",
  "claude",
  "gpt",
  "chatgpt",
  "copilot",
  "bard",
  "bot",
  "output",
  "gemini advanced",
  "gemini pro",
  "claude assistant",
]);

/**
 * Tolerant parser for pasted/copied chat transcripts. Recognizes
 *   **You:** …  |  **Claude:** …  |  ## User  |  User:  |  Human:
 * and assistant aliases. Consecutive same-role turns are merged.
 * Returns a normalized InternalChat, or null when no role markers exist.
 */
export function tryTranscript(text) {
  if (!text || !text.trim()) return null;

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const messages = [];
  let currentRole = null;
  let buf = "";
  let hasRoleMarkers = false;

  function flushPending() {
    if (currentRole && buf !== "") {
      messages.push({ role: currentRole, text: buf });
    }
    buf = "";
  }

  for (const line of lines) {
    const trimmed = line.trim();
    let role = null;
    let content = trimmed;

    if (trimmed) {
      const bold = trimmed.match(/^\*\*([^*]+?)\*\*:?\s*(.*)$/);
      if (bold && classifyRole(bold[1])) {
        role = classifyRole(bold[1]);
        content = bold[2].trim();
        hasRoleMarkers = true;
      } else {
        const heading = trimmed.match(/^#{1,6}\s*([^#\n]+?):?$/i);
        if (heading && classifyRole(heading[1])) {
          role = classifyRole(heading[1]);
          content = "";
          hasRoleMarkers = true;
        } else {
          const plain = trimmed.match(/^([A-Za-z][A-Za-z0-9]*)\s*:\s*(.*)$/);
          if (plain && classifyRole(plain[1]) && plain[2].trim()) {
            role = classifyRole(plain[1]);
            content = plain[2].trim();
            hasRoleMarkers = true;
          }
        }
      }
    }

    if (role) {
      flushPending();
      currentRole = role;
      buf = content;
    } else {
      buf += buf ? "\n" + trimmed : trimmed;
      if (!currentRole) currentRole = "user";
    }
  }
  flushPending();

  if (!hasRoleMarkers || messages.length === 0) return null;

  const merged = [];
  for (const m of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.text += "\n\n" + m.text;
    else merged.push({ role: m.role, text: m.text });
  }

  return toChat({ source: "transcript", messages: merged });
}

function classifyRole(name) {
  const n = String(name || "")
    .trim()
    .replace(/^[*#>\s]+|[*#\s:]+$/g, "")
    .toLowerCase();
  if (USER_NAMES.has(n)) return "user";
  if (ASSISTANT_NAMES.has(n)) return "assistant";
  return null;
}