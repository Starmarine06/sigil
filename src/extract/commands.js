const KNOWN = new Set([
  "npm", "npx", "node", "pnpm", "yarn", "bun", "docker", "git", "make", "pip",
  "python", "nvm", "brew", "curl", "wget", "sh", "bash", "zsh", "mkdir", "rm",
  "cp", "mv", "ls", "cd", "echo", "cat", "touch", "chmod", "sudo", "export",
  "set", "code", "cargo", "go", "psql", "sqlite3", "prisma", "uv", "poetry",
]);

/**
 * Shell commands from assistant turns. Catches:
 *   $ npm i  (line-start)             -> whole rest of line
 *   run `$ npx prisma migrate dev`    -> inside inline backticks
 * A captured run must look command-like (contains whitespace, a slash, or a
 * known command word) so prose containing "$5" never slips in.
 */
export function extractCommands(messages) {
  const out = [];
  for (const msg of messages) {
    const lines = msg.text.replace(/\r/g, "").split("\n");
    for (const line of lines) {
      const start = /^\s*\$\s*([^$\n]+)$/.exec(line);
      if (start) {
        push(start[1], msg.turn);
        continue;
      }
      // inline `$ cmd` (usually backtick-delimited) -> capture up to the next $, ` or newline
      const inline = /\$\s*([^$\n`]+)/g;
      let m;
      while ((m = inline.exec(line))) {
        const cand = m[1].trim();
        if (isCommandLike(cand)) push(cand, msg.turn);
      }
    }
  }
  return out;

  function push(cmd, turn) {
    cmd = cmd.trim().replace(/[),.!\s]+$/, "").trim();
    if (!cmd || cmd.length > 300) return;
    if (isCommandLike(cmd)) out.push({ cmd, turn });
  }
}

function isCommandLike(cmd) {
  if (!cmd || cmd.length < 2) return false;
  if (/\s/.test(cmd)) return true;
  if (cmd.includes("/") || cmd.includes("\\")) return true;
  return KNOWN.has(cmd.toLowerCase());
}