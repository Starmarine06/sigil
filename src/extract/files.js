const EXTENSIONS = [
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "go", "rs", "java", "kt", "kts", "c", "cpp", "cc",
  "h", "hpp", "rb", "php", "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd", "json", "jsonc",
  "yml", "yaml", "toml", "ini", "cfg", "conf", "env", "md", "markdown", "sql", "prisma", "css", "scss",
  "less", "html", "htm", "vue", "svelte", "dart", "swift", "cs", "csv", "tsv", "txt", "log",
  "lock", "xml", "dockerfile", "tf", "tfvars", "proto", "graphql", "gql", "svg", "graph",
];

const PATH_RE = new RegExp(
  `(?<![\\w/.-])([A-Za-z0-9_./@-]*[A-Za-z0-9_-])\\.(${EXTENSIONS.join("|")})(?![\\w.-])`,
  "gi"
);

/**
 * File path references. Returns [{ path, count, turns }], most-mentioned first.
 * Only paths with a known code/config extension count (avoids prose noise).
 */
export function extractFiles(messages) {
  const byPath = new Map();
  for (const msg of messages) {
    const re = new RegExp(PATH_RE.source, "gi");
    let m;
    while ((m = re.exec(msg.text))) {
      let path = m[1] + "." + m[2].toLowerCase();
      path = path.replace(/[.,;:)\]}>]+$/, "");
      if (path.length > 200 || path.includes("http://") || path.includes("https://")) continue;
      const entry = byPath.get(path) || { path, count: 0, turns: [] };
      entry.count++;
      if (!entry.turns.includes(msg.turn)) entry.turns.push(msg.turn);
      byPath.set(path, entry);
    }
  }
  return [...byPath.values()].sort((a, b) => b.count - a.count);
}