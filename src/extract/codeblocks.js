import { extractFiles } from "./files.js";

const FENCE = /```([\w.+=-]*)\r?\n([\s\S]*?)```/g;

/**
 * Fenced code blocks. Keeps the FINAL version of each block (later versions
 * win — that is the most up-to-date), tracks how many iterations a block went
 * through, and links each block to the nearest file path mentioned just above
 * it.
 *
 * Blocks are clustered on a whitespace-normalized form, so near-identical
 * repetitions (re-indented, blank-line moved, trailing-ws changed) collapse
 * into one entry across turns; the latest full source is what is rendered.
 *
 * Returns [{ index, lang, code, turn, firstTurn, lastTurn, count, lines, path }]
 */
export function extractCode(messages) {
  const raw = [];
  for (const msg of messages) {
    const re = new RegExp(FENCE.source, "g");
    let m;
    while ((m = re.exec(msg.text))) {
      const lang = (m[1] || "").trim();
      const code = m[2];
      const before = msg.text.slice(Math.max(0, m.index - 220), m.index);
      raw.push({
        lang,
        code,
        turn: msg.turn,
        lines: code.split("\n").length,
        chars: code.length,
        path: findPath(before, code),
      });
    }
  }

  // Collapse near-identical code; final occurrence wins and owns the source.
  const byCode = new Map();
  for (const b of raw) {
    const key = normalizeKey(b.code);
    if (!key) continue;
    const prev = byCode.get(key);
    if (prev) {
      prev.turn = b.turn; // final wins
      prev.code = b.code;
      prev.lines = b.lines;
      prev.chars = b.chars;
      prev.path = b.path || prev.path;
      prev.lang = prev.lang || b.lang;
      prev.count++;
    } else {
      byCode.set(key, { ...b, count: 1, firstTurn: b.turn });
    }
  }

  const blocks = [...byCode.values()].sort((a, z) => a.firstTurn - z.firstTurn);
  blocks.forEach((b, i) => (b.index = i));
  return blocks;
}

function normalizeKey(code) {
  return code
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function findPath(before, code) {
  // (1) filename in a comment directly preceding the fence
  const re = new RegExp(PATH_RE_SRC.source, "gi");
  const beforeLines = before.split("\n").slice(-4).join("\n");
  let m = re.exec(beforeLines);
  if (m) {
    let p = m[0].trim();
    p = p.replace(/^[`'"#*]|[:;]\s*$/, "");
    if (/^\S/.test(p)) return p;
  }
  // (2) first-line comment of form `// file: path` or `# path` or `-- file: path`
  const first = code.split("\n").slice(0, 3).join("\n");
  const banner = first.match(/(?:\/\/|#|--)\s*(?:file\s*[:=]?\s*|\s+)([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+)/);
  if (banner) return banner[1];
  return null;
}

const EXT_RE = [...new Set(["js", "ts", "tsx", "jsx", "py", "go", "rs", "rb", "php", "sql", "css", "scss", "html", "vue", "svelte", "json", "yml", "yaml", "sh", "tf", "proto", "md", "toml"])];
const PATH_RE_SRC = new RegExp(`[A-Za-z0-9_./\\-]+\.(?:${EXT_RE.join("|")})`, "gi");