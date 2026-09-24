/**
 * Resolve a pasted URL into raw chat text.
 *
 * Supported forms:
 *   - https://claude.ai/share/<uuid>         → fetched through a public reader proxy.
 *     The raw chat_snapshots endpoint is Cloudflare-challenged, and claude.ai
 *     sends no CORS headers (browsers can't reach it), so the CLI and the web
 *     server do this fetch — never the browser tab.
 *   - https://chatgpt.com/share/<uuid>       → fetched through the reader proxy
 *     (also the legacy https://chat.openai.com/share/<uuid> domain).
 *   - https://share.gemini.google/<token>    → Google serves these only to real
 *     browsers; a server fetch returns a sign-in wall, so the CLI guides the
 *     user to open the link and paste the conversation text instead.
 *   - any other http(s) URL                  → fetched directly (raw JSON export,
 *     gist, pastebin, etc.).
 *
 * Network is only touched when the user supplies a URL. Zero dependencies:
 * uses Node's global fetch (Node >= 18).
 */

const CLAUDE_SHARE_RE = /^https?:\/\/(?:www\.)?claude\.ai\/share\/([0-9a-f-]{20,})$/i;
const CHATGPT_SHARE_RE = /^https?:\/\/(?:www\.)?(?:chatgpt\.com|chat\.openai\.com)\/share\/([0-9a-f-]{20,})$/i;
const GEMINI_SHARE_RE = /^https?:\/\/(?:www\.)?share\.gemini\.google\/([A-Za-z0-9_-]{6,})$/i;

export function looksLikeUrl(text) {
  return typeof text === "string" && /^https?:\/\/\S+/i.test(text.trim());
}

export function claudeShareUuid(text) {
  const m = CLAUDE_SHARE_RE.exec(text.trim());
  return m ? m[1] : null;
}

/** True for ChatGPT share-page URLs (rendered content is the assistant turn). */
export function isChatgptShare(raw) {
  return CHATGPT_SHARE_RE.test(String(raw).trim());
}

/** True for Gemini share-page URLs. */
export function isGeminiShare(raw) {
  return GEMINI_SHARE_RE.test(String(raw).trim());
}

/**
 * Error message when Google walls a Gemini share link. Google serves these
 * pages only to real browsers (even for public links), so the fallback is to
 * open the link and paste the conversation text. The URL goes on its own final
 * line so terminals never truncate it mid-way.
 */
export function geminiGuidanceError(url) {
  return (
    "Google serves Gemini share links only to real browsers (public or not).\n" +
    "Open this in your browser, copy the conversation, and paste it:\n" +
    url
  );
}

/**
 * Reader-proxy URL for a share page that needs a browser, or the URL itself
 * for anything fetchable directly.
 */
export function proxyTarget(raw) {
  const url = String(raw).trim();
  const uuid = claudeShareUuid(url);
  if (uuid) return snapshotUrl(uuid);
  if (CHATGPT_SHARE_RE.test(url) || GEMINI_SHARE_RE.test(url)) {
    return `https://r.jina.ai/${url}`;
  }
  return url;
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
 * Fetch with retry/backoff on rate limits (HTTP 429) and transient 5xx,
 * since reader proxies and origin servers both rate-limit anonymous clients.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(target, headers, tries = 3) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(target, {
        signal: AbortSignal.timeout(30000),
        headers,
      });
      if (res.status !== 429 && res.status < 500) return res;
      last = new Error(`HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
    if (i < tries - 1) await sleep((i + 1) * 1500);
  }
  throw last;
}

/**
 * Fetch the content behind a pasted link. Returns the raw body text
 * (for a claude share URL: the snapshot JSON). Throws on failure.
 */
export async function fetchLink(raw) {
  const url = String(raw).trim();
  if (!looksLikeUrl(url)) throw new Error(`not a URL: ${raw}`);
  const target = proxyTarget(url);
  const res = await fetchWithRetry(target, {
    accept: "application/json, text/plain, */*",
    "user-agent": "sigil/1.0.0",
  });
  if (!res.ok) throw new Error(`fetch failed (HTTP ${res.status}) for ${target}`);
  const body = await res.text();
  const out = stripJinaWrapper(body).trim();
  if (
    isGeminiShare(url) &&
    /accounts\.google\.com\/ServiceLogin/i.test(out)
  ) {
    throw new Error(geminiGuidanceError(url));
  }
  if (!out) throw new Error(`empty response from ${target}`);
  return out;
}