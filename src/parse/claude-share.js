import { contentText, normalizeRole } from "./detect.js";
import { toChat } from "./normalize.js";

/**
 * Claude.ai shared-snapshot JSON — the payload the share page loads from
 * `https://claude.ai/api/chat_snapshots/<uuid>`. Shape:
 *   {
 *     uuid, snapshot_name, created_by, creator,
 *     chat_messages: [{ sender: "human"|"assistant", content: block[], ... }]
 *   }
 *
 * Returns a normalized InternalChat, or null if this is not a Claude share snapshot.
 */
export function tryClaudeShare(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (!Array.isArray(data.chat_messages) || !data.chat_messages.length) return null;

  const messages = [];
  for (const m of data.chat_messages) {
    if (!m || typeof m !== "object") continue;
    if (m.sender && m.content != null) {
      messages.push({ role: normalizeRole(m.sender), text: contentText(m.content) });
    }
  }
  if (!messages.some((m) => m.text.trim())) return null;

  return toChat({
    title: data.snapshot_name || data.name || "",
    source: "claude-share",
    at: data.created_at || null,
    messages,
  });
}