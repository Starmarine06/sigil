#!/usr/bin/env node
import { readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve, extname, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { analyze } from "../src/index.js";
import { looksLikeUrl, fetchLink, isChatgptShare } from "../src/fetch-link.js";
import { startTui } from "../src/tui.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HELP = `sigil — deterministic, explainable chat → context (no AI, no keys)

USAGE
  sigil [project-name] [link]   interactive terminal session (like opencode) for a
                                named project; optional link/file/text preloads it
  sigil <FILE | URL> [options]  one-shot: analyze an export, transcript, or share link
  sigil -                       read input from stdin
  sigil --serve [--port N]      start local web UI at http://localhost:PORT

OPTIONS
  -o, --output <file>    write the context markdown to <file> instead of stdout
  --json                 also print the full evidence object as JSON (sections)
  --title <text>         override the conversation title
  --note <text>          append a note line to the generated doc
  --top-sentences <n>    how many representative sentences to keep (default 6)
  --top-keyphrases <n>   how many RAKE keyphrases to keep (default 12)
  --port <n>             port for --serve (default 8177)
  -h, --help             show this help
  --version              print version
`;

function fail(msg) {
  process.stderr.write(`sigil: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { port: 8177, topSentences: 6, topKeyphrases: 12 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "-h": case "--help": return { help: true };
      case "--version": return { version: true };
      case "--serve": case "--web": opts.serve = true; break;
      case "--json": opts.json = true; break;
      case "-": positional.push("-"); break;
      case "-o": case "--output": opts.output = next(); if (opts.output === undefined) fail(`${a} requires a value`); break;
      case "--title": opts.title = next(); break;
      case "--note": opts.note = next(); break;
      case "--port": opts.port = Number(next()); break;
      case "--top-sentences": opts.topSentences = Number(next()); break;
      case "--top-keyphrases": opts.topKeyphrases = Number(next()); break;
      default:
        if (a.startsWith("--output=")) opts.output = a.slice(9);
        else if (a.startsWith("--port=")) opts.port = Number(a.slice(7));
        else if (a.startsWith("--title=")) opts.title = a.slice(8);
        else if (a.startsWith("--note=")) opts.note = a.slice(7);
        else if (a.startsWith("--top-sentences=")) opts.topSentences = Number(a.slice(16));
        else if (a.startsWith("--top-keyphrases=")) opts.topKeyphrases = Number(a.slice(17));
        else positional.push(a);
    }
  }
  return { ...opts, positional };
}

async function main() {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);

  if (parsed.help) return process.stdout.write(HELP);
  if (parsed.version) return process.stdout.write(`sigil 1.1.0\n`);
  if (parsed.serve) return startServer(parsed.port || 8177);

  const arg = parsed.positional[0];

  // Interactive terminal session when: no args, a project name, or a directory.
  const asUrl = (a) => a && looksLikeUrl(a);
  const asDir = (a) => a && a !== "-" && existsSync(a) && statSync(a).isDirectory();
  const isInteractive =
    arg === undefined ||
    (arg !== "-" && !asUrl(arg) && (!existsSync(arg) || statSync(arg).isDirectory()));

  if (isInteractive) {
    const projectName = asDir(arg) ? basename(arg) : arg || basename(process.cwd());
    const arg2 = parsed.positional[1];
    let preload = null;
    if (arg2) {
      if (asUrl(arg2)) preload = { url: arg2 };
      else if (asDir(arg2)) preload = null;
      else if (existsSync(arg2)) preload = { raw: readFileSync(arg2, "utf8") };
      else preload = { raw: arg2 };
    }
    return startTui(projectName, { preload });
  }

  const file = arg;
  if (!file) fail("no input file given. See --help.");
  if (file !== "-" && !asUrl(file) && !existsSync(file)) fail(`file not found: ${file}`);

  let raw;
  try {
    if (file === "-") {
      raw = readFileSync(0, "utf8");
    } else if (looksLikeUrl(file)) {
      process.stderr.write(`sigil: fetching ${file}\n`);
      try {
        raw = await fetchLink(file);
        if (isChatgptShare(file)) raw = "**Assistant:**\n\n" + raw;
      } catch (e) {
        fail(`could not fetch ${file}: ${e.message}`);
      }
    } else {
      if (!existsSync(file)) fail(`file not found: ${file}`);
      if (statSync(file).isDirectory()) fail(`expected a file, got a directory: ${file}`);
      raw = readFileSync(file, "utf8");
    }
  } catch (e) {
    fail(`could not read input: ${e.message}`);
  }

  const result = analyze(raw, { title: parsed.title, note: parsed.note, topSentences: parsed.topSentences, topKeyphrases: parsed.topKeyphrases });

  if (result.error) fail(result.error);

  if (parsed.output) {
    const outPath = resolve(process.cwd(), parsed.output);
    writeFileSync(outPath, result.markdown, "utf8");
    process.stdout.write(`wrote ${outPath}\n`);
    if (parsed.json) process.stdout.write(JSON.stringify(result.sections, null, 2) + "\n");
  } else {
    process.stdout.write(result.markdown + "\n");
    if (parsed.json) process.stdout.write("\n" + JSON.stringify(result.sections, null, 2) + "\n");
  }
}

// ── minimal zero-dependency static server for the web UI ──────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function answer(res, code, body, json) {
  res.writeHead(code, {
    "content-type": json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
  });
  res.end(body);
}

function startServer(port) {
  if (!existsSync(join(ROOT, "web", "index.html"))) fail("web UI not found in this package");
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");

      // POST /api/analyze { url?: string, text?: string, title?: string }
      if (url.pathname === "/api/analyze" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        let input = {};
        try {
          input = JSON.parse(body || "{}");
        } catch {
          return answer(res, 400, "bad json body", true);
        }
        let raw;
        try {
          if (typeof input.url === "string" && looksLikeUrl(input.url)) {
            raw = await fetchLink(input.url);
            if (isChatgptShare(input.url)) raw = "**Assistant:**\n\n" + raw;
          } else if (typeof input.text === "string") {
            raw = input.text;
          } else {
            return answer(res, 400, "please provide {\"url\": ...} or {\"text\": ...}", true);
          }
        } catch (e) {
          return answer(res, 502, JSON.stringify({ error: e.message }), true);
        }
        const result = analyze(raw, { title: input.title });
        if (result.error) return answer(res, 422, JSON.stringify({ error: result.error }), true);
        return answer(res, 200, JSON.stringify({ markdown: result.markdown, sections: result.sections }), true);
      }

      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/web/index.html";
      const filePath = resolve(ROOT, "." + pathname);
      if (!filePath.startsWith(resolve(ROOT + "/")) || pathname.split("/").some((p) => p.startsWith("."))) {
        res.writeHead(403, { "content-type": "text/plain" });
        res.end("forbidden");
        return;
      }
      const ext = extname(filePath);
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("404 not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "x-content-type-options": "nosniff" });
      res.end(readFileSync(filePath));
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(e.message || e));
    }
  });
  server.listen(port, () => {
    process.stdout.write(`sigil web UI → http://localhost:${port}/\n`);
    process.stdout.write(`(press Ctrl+C to stop)\n`);
  });
  server.on("error", (e) => fail(`could not bind port ${port}: ${e.message}`));
}

main().catch((e) => fail(e.stack || String(e)));