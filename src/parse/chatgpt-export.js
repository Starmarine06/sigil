import { toChat } from "./normalize.js";

/**
 * ChatGPT data export (conversations.json from Settings > Data controls > Export).
 * Shapes handled:
 *   - [ { title, create_time, mapping, current_node }, ... ] (the whole file)
 *   - { title, mapping, current_node } (one conversation pulled out of it)
 *
 * Each conversation is a tree: `mapping` holds nodes keyed by id, each with a
 * `parent`, and `current_node` is the leaf of the branch the user last saw.
 * Walking parents from that leaf gives the visible thread and skips edited or
 * regenerated branches. With several conversations, the most recently updated
 * one wins.
 *
 * Returns a normalized InternalChat, or null if this is not a ChatGPT export.
 */
export function tryChatGPTExport(data) {
  if (!data || typeof data !== "object") return null;

  const candidates = (Array.isArray(data) ? data : [data]).filter(isConversation);
  if (!candidates.length) return null;

  const ranked = candidates
    .map((c, i) => ({ c, i, t: Number(c.update_time || c.create_time || 0) }))
    .sort((a, b) => b.t - a.t || a.i - b.i);

  for (const { c } of ranked) {
    const messages = threadMessages(c);
    if (messages.some((m) => m.text.trim())) {
      const at = Number(c.create_time || c.update_time || 0);
      return toChat({
        title: typeof c.title === "string" ? c.title : "",
        source: "chatgpt",
        at: at ? new Date(at * 1000).toISOString() : null,
        messages,
      });
    }
  }
  return null;
}

function isConversation(c) {
  return !!c && typeof c === "object" && !!c.mapping && typeof c.mapping === "object" && !Array.isArray(c.mapping);
}

function threadMessages(conv) {
  const mapping = conv.mapping;
  const path = [];
  const seen = new Set();
  let id = conv.current_node && mapping[conv.current_node] ? conv.current_node : lastLeaf(mapping);
  while (id && mapping[id] && !seen.has(id)) {
    seen.add(id);
    path.push(mapping[id]);
    id = mapping[id].parent;
  }
  path.reverse();

  const messages = [];
  for (const node of path) {
    const m = node && node.message;
    if (!m || !m.author) continue;
    const role = m.author.role;
    if (role !== "user" && role !== "assistant") continue;
    const meta = m.metadata || {};
    if (meta.is_visually_hidden_from_conversation) continue;
    const text = contentText(m.content);
    if (!text.trim()) continue;
    const model = role === "assistant" ? meta.model_slug || null : null;
    const prev = messages[messages.length - 1];
    // The assistant often answers in several consecutive nodes (tool calls,
    // code, final text). Keep them as one turn.
    if (prev && prev.role === "assistant" && role === "assistant") {
      prev.text += "\n\n" + text;
      prev.model = prev.model || model;
    } else {
      messages.push({ role, text, model });
    }
  }
  return messages;
}

function lastLeaf(mapping) {
  let best = null;
  let bestTime = -1;
  for (const [id, node] of Object.entries(mapping)) {
    if (!node || (Array.isArray(node.children) && node.children.length)) continue;
    const t = Number((node.message && node.message.create_time) || 0);
    if (t >= bestTime) {
      best = id;
      bestTime = t;
    }
  }
  return best;
}

function contentText(content) {
  if (!content || typeof content !== "object") return "";
  const type = content.content_type;
  if (type === "text" || type === "multimodal_text") {
    return (content.parts || [])
      .map((p) => (typeof p === "string" ? p : p && typeof p.text === "string" ? p.text : ""))
      .filter((p) => p.trim())
      .join("\n\n");
  }
  if (type === "code" && typeof content.text === "string") {
    const lang = content.language && content.language !== "unknown" ? content.language : "";
    return "```" + lang + "\n" + content.text + "\n```";
  }
  return "";
}
