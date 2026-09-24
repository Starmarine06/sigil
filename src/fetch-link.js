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

import path from "node:path";
import { pathToFileURL } from "node:url";

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
 * Name of the optional Gemini reader package, from the SIGIL_GEMINI_READER
 * environment variable. A bare specifier resolves like any npm package (global
 * installs share one node_modules, so a globally-installed reader is found);
 * an absolute or relative path is loaded directly.
 */
export function geminiReaderName() {
  const v = process.env.SIGIL_GEMINI_READER;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isFileSpecifier(name) {
  return /^\.{0,2}[/\\]/.test(name) || /^[A-Za-z]:[\\/]/.test(name) || /^[/\\]/.test(name);
}

/**
 * Bare package names import as-is; file paths become file:// URLs (required by
 * the ESM loader, and relative paths resolve against the current directory).
 */
function toImportSpec(name) {
  if (!isFileSpecifier(name)) return name;
  const abs = path.isAbsolute(name) ? name : path.resolve(process.cwd(), name);
  return pathToFileURL(abs).href;
}

/**
 * Contract of a Gemini reader module:
 *   - default export, or a named `fetchGemini`, is an async function
 *   - input:  { url: <share_url> }
 *   - output: { text: <transcript or markdown>, title?: string }
 * Returns null when no reader is configured; throws when a configured reader
 * cannot be loaded or fails.
 */
export async function fetchGeminiViaReader(url) {
  const name = geminiReaderName();
  if (!name) return null;
  let mod;
  try {
    mod = await import(toImportSpec(name));
  } catch (e) {
    throw new Error(
      `SIGIL_GEMINI_READER is set to "${name}" but that module could not be loaded: ${e.message}. ` +
        "Install or publish the reader package, fix the path, or unset the variable to use the built-in guidance."
    );
  }
  const fn = mod.default || mod.fetchGemini;
  if (typeof fn !== "function") {
    throw new Error(`SIGIL_GEMINI_READER "${name}" exports no default function and no \`fetchGemini\` export.`);
  }
  const out = await fn({ url });
  const text = out && typeof out.text === "string" ? out.text.trim() : "";
  if (!text) {
    throw new Error(`SIGIL_GEMINI_READER "${name}" returned no \`text\` string.`);
  }
  return { text, title: out && typeof out.title === "string" ? out.title : null };
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
 * True when a proxy fetch of a Gemini share returned a Google blocking page
 * instead of the conversation: the sign-in wall or in-app error shells
 * ("Check your internet connection…", "We could not complete your request…").
 * Deliberately narrow — actual transcripts that merely mention google/gemini
 * must not be classified as blocked.
 */
export function geminiBlocked(text) {
  return /(accounts\.google\.com\/ServiceLogin|Check your internet connection and try again|We could not complete your request)/i.test(
    String(text)
  );
}

/**
 * Fetch the content behind a pasted link. Returns the raw body text
 * (for a claude share URL: the snapshot JSON). Throws on failure.
 */
export async function fetchLink(raw) {
  const url = String(raw).trim();
  if (!looksLikeUrl(url)) throw new Error(`not a URL: ${raw}`);
  if (isGeminiShare(url)) {
    const viaReader = await fetchGeminiViaReader(url);
    if (viaReader) return viaReader.text;
  }
  const target = proxyTarget(url);
  const res = await fetchWithRetry(target, {
    accept: "application/json, text/plain, */*",
    "user-agent": "sigil/1.0.0",
  });
  if (!res.ok) throw new Error(`fetch failed (HTTP ${res.status}) for ${target}`);
  const body = await res.text();
  const out = stripJinaWrapper(body).trim();
  if (isGeminiShare(url) && geminiBlocked(out)) {
    throw new Error(geminiGuidanceError(url));
  }
  if (!out) throw new Error(`empty response from ${target}`);
  return out;
}