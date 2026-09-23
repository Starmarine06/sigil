import { tryClaudeExport } from "./claude-export.js";
import { tryClaudeShare } from "./claude-share.js";
import { tryGeminiTakeout } from "./gemini-takeout.js";
import { tryGeminiConsole } from "./gemini-console.js";
import { tryTranscript } from "./transcript.js";
import { toChat } from "./normalize.js";

/**
 * Auto-detects the input format and returns a normalized InternalChat.
 *
 * `input` may be:
 *   - a string (raw pasted text, or JSON text)
 *   - a parsed JSON object/array
 *
 * On failure returns { error } describing what was detected.
 */
export function parseInput(input, opts = {}) {
  let data = input;

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed && /^[{[]/.test(trimmed)) {
      try {
        data = JSON.parse(trimmed);
      } catch {
        if (trimmed[0] === "{") {
          return {
            error: "Input looks like JSON but could not be parsed. Check the file for truncated/corrupt content.",
          };
        }
        // A leading "[" is ambiguous: a JSON array vs. markdown link syntax
        // like "[Sign in](https://…)". If it isn't valid JSON, treat it as
        // rendered text (e.g. reader-proxy output).
        return parseTranscriptFallback(trimmed);
      }
    } else {
      return parseTranscriptFallback(trimmed);
    }
  }

  if (data && typeof data === "object") {
    const claude = tryClaudeExport(data);
    if (claude) return claude;

    const claudeShare = tryClaudeShare(data);
    if (claudeShare) return claudeShare;

    const geminiConsole = tryGeminiConsole(data);
    if (geminiConsole) return geminiConsole;

    const geminiTakeout = tryGeminiTakeout(data);
    if (geminiTakeout) return geminiTakeout;

    // Array of {role, content} (bare message list).
    if (Array.isArray(data) && data.length && data.every((m) => m && m.role && m.content != null)) {
      const messages = data.map((m) => ({
        role: normalizeRole(m.role),
        text: contentText(m.content),
        model: m.model || null,
      }));
      if (messages.some((m) => m.text.trim())) {
        return toChat({ source: "generic", messages });
      }
    }
  }

  return {
    error: "Unrecognized input. Expected a Claude export JSON, Gemini export JSON, or pasted chat text.",
  };
}

function parseTranscriptFallback(text) {
  const parsed = tryTranscript(text);
  if (parsed) return parsed;
  // No role markers found: keep the whole paste as one user message.
  return toChat({
    source: "text",
    messages: [{ role: "user", text }],
  });
}

export function normalizeRole(role) {
  const r = String(role || "").toLowerCase();
  if (["assistant", "model", "ai", "gemini", "claude", "bot", "output"].includes(r)) return "assistant";
  if (["user", "human", "me", "prompt", "input", "you"].includes(r)) return "user";
  return r === "assistant" ? "assistant" : "user";
}

export function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!block || typeof block !== "object") return "";
        if (block.type === "text" && typeof block.text === "string") return block.text;
        if (block.type === "tool_result" && block.content) return contentText(block.content);
        if (block.type === "tool_use") return `[tool_use: ${block.name || ""}]`;
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}