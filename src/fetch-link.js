/**
 * Resolve a pasted URL into raw chat text.
 *
 * Supported forms:
 *   - https://claude.ai/share/<uuid>  → fetched through a public reader proxy.
 *     The raw chat_snapshots endpoint is Cloudflare-challenged, and claude.ai
 *     sends no CORS headers (browsers can't reach it), so the CLI and the web
 *     server do this fetch — never the browser tab.
 *   - any other http(s) URL           → fetched directly (raw JSON export, gist,
 *     pastebin, etc.).
 *
 * Network is only touched when the user supplies a URL. Zero dependencies:
 * uses Node's global fetch (Node >= 18).
 */

const CLAUDE_SHARE_RE = /^https?:\/\/(?:www\.)?claude\.ai\/share\/([0-9a-f-]{20,})$/i;

export function looksLikeUrl(text) {
  return typeof text === "string" && /^https?:\/\/\S+/i.test(text.trim());
}

export function claudeShareUuid(text) {
  const m = CLAUDE_SHARE_RE.exec(text.trim());
  return m ? m[1] : null;
}

/** Proxy URL for a claude.ai share snapshot (bypasses the Cloudflare challenge). */
export function snapshotUrl(uuid) {
  return `https://r.jina.ai/https://claude.ai/api/chat_snapshots/${uuid}?rendering_mode=messages&render_all_tools=true`;
}

/**
 * r.jina.ai wraps its responses in a small text enclosure:
 *   Title: <t>\n\nURL Source: <u>\n\nMarkdown Content:\n<actual body>
 * Strip everything up to and including the first newline after the marker.
 */
export function stripJinaWrapper(text) {
  const marker = "Markdown Content:";
  const at = text.indexOf(marker);
  if (at === -1) return text;
  const nl = text.indexOf("\n", at);
  return nl === -1 ? "" : text.slice(nl + 1);
}

/**
 * Fetch the content behind a pasted link. Returns the raw body text
 * (for a claude share URL: the snapshot JSON). Throws on failure.
 */
export async function fetchLink(raw) {
  const url = String(raw).trim();
  if (!looksLikeUrl(url)) throw new Error(`not a URL: ${raw}`);
  const uuid = claudeShareUuid(url);
  const target = uuid ? snapshotUrl(uuid) : url;
  const res = await fetch(target, {
    signal: AbortSignal.timeout(30000),
    headers: { accept: "application/json, text/plain, */*", "user-agent": "sigil/1.0.0" },
  });
  if (!res.ok) throw new Error(`fetch failed (HTTP ${res.status}) for ${target}`);
  const body = await res.text();
  const out = stripJinaWrapper(body).trim();
  if (!out) throw new Error(`empty response from ${target}`);
  return out;
}