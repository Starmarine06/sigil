import { toChat } from "./normalize.js";

/**
 * Google Takeout — "My Activity" export for Gemini Apps.
 * Real shape is an array of entries:
 *   { "title": "...", "time": "2026-02-03T10:12:00Z",
 *     "event": [ { "name": "gemini_apps",
 *       "params": [ { "key": "prompt", "value": "..." },
 *                   { "key": "gemini_response", "value": "..." } ] } ] }
 * Entries without event params (plain strings) are treated as user prompts.
 */
export function tryGeminiTakeout(data) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const entries = data.filter((e) => e !== null && e !== undefined);
  if (entries.length === 0) return null;

  const messages = [];
  let title = "";
  let at = null;

  for (const entry of entries) {
    if (typeof entry === "string") {
      messages.push({ role: "user", text: entry });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    if (!title && entry.title) title = String(entry.title);
    if (!at && entry.time) at = entry.time;

    const events = Array.isArray(entry.event) ? entry.event : [entry.event];
    for (const ev of events) {
      if (!ev || typeof ev !== "object") continue;
      const params = Array.isArray(ev.params) ? ev.params : [];
      const get = (key) => {
        const hit = params.find((p) => p && p.key === key);
        return hit ? String(hit.value || "") : "";
      };
      const prompt = get("prompt");
      const response = get("gemini_response");
      if (prompt) messages.push({ role: "user", text: prompt });
      if (response) messages.push({ role: "assistant", text: response });
    }
  }

  if (!messages.some((m) => m.text.trim())) return null;

  return toChat({ title, source: "gemini-takeout", at, messages });
}