const TECH = [
  "react", "react native", "node", "node.js", "nodejs", "next.js", "nextjs", "nuxt", "express",
  "fastify", "nest", "fastapi", "django", "flask", "spring boot", "laravel", "rails",
  "prisma", "drizzle", "typeorm", "sequelize", "sqlite", "postgresql", "postgres", "mysql",
  "mongodb", "redis", "mariadb", "cassandra",
  "docker", "kubernetes", "k8s", "terraform", "ansible", "helm",
  "aws", "gcp", "azure", "vercel", "netlify", "cloudflare", "firebase", "supabase",
  "tailwind", "material ui", "shadcn", "bootstrap",
  "typescript", "javascript", "python", "rust", "swift", "kotlin", "c#", "php", "go",
  "graphql", "rest api", "grpc", "websocket", "rabbitmq", "kafka",
  "playwright", "pytest", "jest", "vitest", "mocha", "cypress", "selenium",
  "vite", "webpack", "esbuild", "rollup", "parcel", "babel",
  "npm", "pnpm", "yarn", "bun", "pip", "poetry", "cargo", "gradle", "maven",
  "git", "github", "gitlab", "bitbucket", "github actions", "circleci", "jenkins",
  "electron", "tauri", "pytorch", "tensorflow", "keras", "onnx", "openai", "ollama", "llm",
  "html", "css", "sass", "less", "svg", "bootstrap",
];

const WORD = (alias) => new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(alias)}(?![A-Za-z0-9])`, "i");

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Keyword-based tech-stack detection. Each hit is evidenced by its turns.
 * Returns [{ term, count, turns }] sorted by frequency.
 */
export function extractTechStack(messages) {
  const found = [];
  for (const alias of TECH) {
    const re = WORD(alias);
    const turns = messages.filter((m) => re.test(m.text)).map((m) => m.turn);
    if (turns.length) {
      found.push({
        term: alias === "postgres" ? "postgresql" : alias === "nodejs" ? "node.js" : alias,
        count: turns.length,
        turns,
      });
    }
  }
  // Collapse near-duplicate aliases (node + node.js, postgres + postgresql).
  const merged = new Map();
  for (const t of found) {
    const key = t.term;
    const prev = merged.get(key);
    if (prev) {
      prev.turns = [...new Set([...prev.turns, ...t.turns])];
      prev.count = prev.turns.length;
    } else {
      merged.set(key, { ...t, turns: [...t.turns] });
    }
  }
  return [...merged.values()].sort((a, b) => b.count - a.count);
}