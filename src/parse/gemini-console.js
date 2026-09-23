import { contentText, normalizeRole } from "./detect.js";
import { toChat } from "./normalize.js";

/**
 * Gemini browser-console export (e.g. gemini-export userscripts):
 *   { source, exported_at?, conversations: [
 *       { title, url?, messageCount?, messages: [{ role, content }] } ] }
 * Uses the first conversation that has messages, merging any others after.
 */
export function tryGeminiConsole(data) {
  if (!data || typeof data !== "object") return null;
  if (!Array.isArray(data.conversations)) return null;

  const all = [];
  let title = "";
  let at = data.exported_at || null;

  for (const conv of data.conversations) {
    if (!conv || !Array.isArray(conv.messages)) continue;
    if (!title && conv.title) title = String(conv.title);
    if (!at && conv.extracted_at) at = conv.extracted_at;
    for (const m of conv.messages) {
      if (!m || m.content == null) continue;
      all.push({ role: normalizeRole(m.role || "user"), text: contentText(m.content) });
    }
  }

  if (!all.some((m) => m.text.trim())) return null;

  return toChat({ title, source: "gemini", at, messages: all });
}