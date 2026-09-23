/**
 * Normalizes any parsed chat into the internal shape:
 *   { title, source, at, models, messages: [{ role, text, turn, model? }] }
 */
export function toChat(parsed) {
  const raw = (parsed.messages || []).filter((m) => m && (m.text || "").trim());
  const messages = raw.map((m, i) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    text: (m.text || "").replace(/\r\n/g, "\n"),
    turn: i,
    model: m.model || null,
  }));

  const models = [...new Set(messages.map((m) => m.model).filter(Boolean))];
  const title =
    (parsed.title && parsed.title.trim()) ||
    deriveTitle(messages) ||
    "Untitled conversation";

  return { title, source: parsed.source || "unknown", at: parsed.at || null, models, messages };
}

function deriveTitle(messages) {
  const first = messages.find((m) => m.role === "user");
  const text = (first ? first.text : "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 70) : "";
}