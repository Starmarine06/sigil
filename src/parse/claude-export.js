import { contentText, normalizeRole } from "./detect.js";
import { toChat } from "./normalize.js";

/**
 * Claude.ai official export. Tolerant to several real shapes:
 *   - { name, created_at, messages: [{ role, content: string | block[] }] }
 *   - [ { ... } ] (array of chat objects)
 *   - { chat_sessions: { uuid: {..., messages: [] } } } (zip/backup variant)
 *
 * Returns a normalized InternalChat, or null if this is not a Claude export.
 */
export function tryClaudeExport(data) {
  if (!data || typeof data !== "object") return null;

  const candidates = Array.isArray(data)
    ? data
    : data.chat_sessions
      ? Object.entries(data.chat_sessions).map(([uuid, chat]) => ({ ...chat, id: chat.id || uuid }))
      : [data];

  const holder = candidates
    .slice()
    .reverse()
    .find((c) => Array.isArray(c && c.messages) && c.messages.length);

  if (!holder || !Array.isArray(holder.messages)) return null;

  const messages = [];
  for (const m of holder.messages) {
    if (!m || typeof m !== "object") continue;
    if (m.role && m.content != null) {
      messages.push({ role: normalizeRole(m.role), text: contentText(m.content), model: m.model || holder.model });
    } else if (typeof m === "string") {
      messages.push({ role: "user", text: m });
    }
  }
  if (!messages.some((m) => m.text.trim())) return null;

  return toChat({
    title: holder.name || holder.title || "",
    source: "claude",
    at: holder.created_at || holder.updated_at || null,
    messages,
  });
}