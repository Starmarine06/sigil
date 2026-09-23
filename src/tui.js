import { basename, join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { analyze } from "./index.js";
import { looksLikeUrl, fetchLink } from "./fetch-link.js";
import { copyText } from "./clipboard.js";
import { getProject, setProject } from "./store.js";
import { createDecoder, decodeInput, sanitizeTerminal } from "./tui-input.js";

const AN = {
  r: "\x1b[0m",
  b: "\x1b[1m",
  d: "\x1b[2m",
  c: "\x1b[36m",
  g: "\x1b[32m",
  y: "\x1b[33m",
  x: "\x1b[31m",
  m: "\x1b[35m",
  p: "\x1b[2;36m", // dim cyan — panel frame
  ig: "\x1b[1;32m", // bold green — input box frame
};

const HELP = [
  "commands:",
  "  <link>           fetch a claude share link or any URL → generate context",
  "  <text>           analyze pasted chat / export / transcript",
  "  /copy            copy the context doc to the clipboard (prompt-ready)",
  "  /save [path]     write the context doc to a markdown file",
  "  /state           jump to the \"Current state\" section",
  "  /show            show the whole doc in the panel",
  "  /top  /bottom    scroll to top / bottom",
  "  /clear           reset the session buffer",
  "  /exit, Ctrl+Q    quit",
  "",
  "keys:",
  "  Ctrl+Alt+C       copy the context doc",
  "  Ctrl+P           toggle this commands panel",
  "  arrows, PgUp/PgDn, Home/End  scroll",
  "",
  "reopen later:  sigil <name>",
];

// Shown in the centered footer on every repaint (openccode-style key hints).
const FOOTER = "Ctrl+Alt+C copy context   ·   Ctrl+P commands   ·   Ctrl+Q quit   ·   /help";

export async function startTui(projectName, { preload } = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    process.stderr.write(
      "sigil: interactive mode needs a terminal.\n" +
        "  use \"sigil <FILE | URL>\" for one-shot analysis.\n"
    );
    process.exit(1);
  }

  const name = projectName || basename(process.cwd());
  const project = getProject(name);

  let lines = [];
  let scroll = 0;
  let buffer = "";
  let status = "";
  let context = null;
  let overlay = null; // commands/doc panel
  let dirty = false;
  let prevRows = 0;
  let prevCols = 0;

  const hint = "paste a share link or chat text, then Ctrl+Alt+C to copy the context";
  const welcome = () => {
    lines = [];
    lines.push(AN.b + "sigil" + AN.r + " — " + AN.c + name + AN.r);
    if (project && project.title) lines.push("  saved project: " + AN.d + project.title + AN.r);
    if (project && project.savedFile && existsSync(project.savedFile)) {
      const md = sanitizeTerminal(readFileSync(project.savedFile, "utf8"));
      context = { markdown: md, sections: null };
      lines.push("  resumed saved context: " + AN.d + project.savedFile + AN.r);
      lines.push("");
      lines.push(...md.split("\n"));
      status = "resumed " + md.length.toLocaleString() + " chars · Ctrl+Alt+C to copy";
    } else {
      lines.push("");
      lines.push(AN.d + "new project — paste a share link (https://claude.ai/share/…) or chat text." + AN.r);
      lines.push("");
      lines.push(...HELP);
    }
    overlay = null;
    scroll = 0;
  };

  welcome();

  function generate(raw) {
    status = "analyzing…";
    render();
    const result = analyze(raw);
    if (result.error) {
      status = AN.x + "✖ " + result.error + AN.r;
      render();
      return;
    }
    context = { markdown: result.markdown, sections: result.sections };
    lines = sanitizeTerminal(result.markdown).split("\n");
    overlay = null;
    scroll = 0;
    const chat = result.chat || {};
    setProject(name, {
      source: chat.source,
      title: chat.title || null,
      messages: result.sections.stats.messageCount,
    });
    status =
      "✔ " + result.sections.stats.messageCount + " msgs · " + result.markdown.length.toLocaleString() +
      " chars · " + (chat.title || "untitled") + " · Ctrl+Alt+C to copy";
    render();
  }

  async function runUrl(url) {
    status = "fetching " + url.replace(/^https?:\/\//, "") + "…";
    render();
    try {
      const raw = await fetchLink(url);
      generate(raw);
    } catch (e) {
      status = AN.x + "✖ fetch failed: " + (e && e.message ? e.message : e) + AN.r;
      render();
    }
  }

  // ── input handling (all decoding lives in ./tui-input.js) ─────────
  const decoder = createDecoder();
  const INPUT_CAP = 500_000;

  function onData(chunk) {
    const events = decodeInput(decoder, chunk);
    for (const ev of events) {
      switch (ev.t) {
        case "text":
          if (buffer.length + ev.v.length > INPUT_CAP) {
            status = AN.y + "input capped at 500k chars" + AN.r;
            break;
          }
          buffer += ev.v;
          break;
        case "submit":
          submit(buffer);
          buffer = "";
          break;
        case "backspace":
          buffer = buffer.slice(0, -1);
          break;
        case "scroll":
          scrollBy(ev.d);
          break;
        case "scrollTo":
          scroll = ev.pos === "top" ? 0 : Infinity;
          break;
        case "copy":
          copyContext();
          break;
        case "commands":
          toggleOverlay();
          break;
        case "exit":
          return exit();
      }
    }
    scheduleRender();
  }

  function copiedMessage(n) {
    return "copied " + n.toLocaleString() + " chars to clipboard";
  }

  function copyContext() {
    if (context) {
      if (copyText(context.markdown)) status = "✔ " + copiedMessage(context.markdown.length);
      else status = AN.y + "no clipboard tool — /save to write a file, or /show + select" + AN.r;
    } else if (buffer.trim()) {
      if (copyText(buffer)) status = "✔ " + copiedMessage(buffer.length) + " (raw input — run it first for the context doc)";
      else status = AN.y + "no clipboard tool available" + AN.r;
    } else {
      status = AN.y + "no context yet — paste a link or chat first" + AN.r;
    }
    render();
  }

  function scrollBy(n) {
    const { C } = layout();
    const len = shownLines().length;
    scroll = Math.max(0, Math.min(scroll + n, Math.max(0, len - C)));
  }

  async function submit(raw) {
    const input = raw.trim();
    if (!input) return;
    if (input.startsWith("/")) return command(input);
    if (looksLikeUrl(input)) return runUrl(input);
    generate(input);
  }

  function command(cmdline) {
    const [cmd, ...rest] = cmdline.split(/\s+/);
    const arg = rest.join(" ");
    switch (cmd) {
      case "/help":
        toggleOverlay();
        break;
      case "/copy":
        copyContext();
        return;
      case "/save": {
        if (!context) { status = "no context yet"; break; }
        const p = arg ? resolve(process.cwd(), arg) : join(process.cwd(), "context-" + name + ".md");
        try {
          writeFileSync(p, context.markdown, "utf8");
          setProject(name, { savedFile: p });
          status = "saved → " + AN.g + p + AN.r;
        } catch (e) {
          status = AN.x + "save failed: " + e.message + AN.r;
        }
        break;
      }
      case "/state": {
        const i = lines.findIndex((l) => l.trim() === "## Current state");
        if (i >= 0) { overlay = null; scroll = i; status = "jumped to Current state"; }
        else status = "no Current state section in this context";
        break;
      }
      case "/show": {
        if (!context) status = "no context yet";
        else if (overlay) { overlay = null; status = "back to context"; }
        else { overlay = context.markdown.split("\n"); scroll = 0; status = "showing doc (" + context.markdown.length.toLocaleString() + " chars) · Ctrl+P or /show to close"; }
        break;
      }
      case "/top": scroll = 0; break;
      case "/bottom": scroll = Infinity; break;
      case "/clear": welcome(); status = "session cleared"; break;
      case "/exit": case "/quit": return exit();
      default: status = "unknown command " + AN.c + cmd + AN.r + " — try Ctrl+P";
    }
    render();
  }

  function toggleOverlay() {
    overlay = overlay ? null : [...HELP];
    scroll = 0;
  }

  function shownLines() {
    return overlay || lines;
  }

  // ── rendering (alternate screen, single centered bordered panel) ──
  function visibleLen(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "\x1b") {
        const m = s.slice(i).match(/^\x1b\[[0-9;?]*[a-zA-Z]/);
        if (m) { i += m[0].length - 1; continue; }
      }
      n++;
    }
    return n;
  }

  function wrapLine(line, width) {
    const s = String(line);
    if (width < 2) return [s.slice(0, Math.max(1, width))];
    if (!s.includes("\x1b")) {
      const w = Math.max(1, width);
      if (s.length <= w) return [s];
      const out = [];
      for (let i = 0; i < s.length; i += w) out.push(s.slice(i, i + w));
      return out;
    }
    const out = [];
    let cur = "";
    let vw = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "\x1b") {
        const m = s.slice(i).match(/^\x1b\[[0-9;?]*[a-zA-Z]/);
        if (m) { cur += m[0]; i += m[0].length - 1; continue; }
        cur += s[i];
        continue;
      }
      if (vw >= width) { out.push(cur); cur = ""; vw = 0; }
      cur += s[i];
      vw++;
    }
    if (cur) out.push(cur);
    return out.length ? out : [""];
  }

  function layout() {
    const rows = process.stdout.rows || 24;
    const cols = process.stdout.columns || 80;
    const bufLines = buffer.split("\n");
    const inRows = Math.max(1, Math.min(4, bufLines.length));
    // chrome: top border + header + 2 dividers + bottom border + spacer + footer
    const need = 7 + inRows + 2;
    let top = rows >= 22 ? Math.max(1, Math.floor(rows * 0.1)) : 0;
    if (rows - 2 * top - need < 2) top = Math.max(0, Math.floor((rows - need) / 2));
    const C = Math.max(1, rows - 2 * top - 7 - inRows);
    return { rows, cols, top, C, inRows, W: Math.max(2, cols - 4) };
  }

  /** Pad a plain line with spaces to n, truncating to n visible chars. */
  function fitPlain(s, n) {
    const v = visibleLen(s);
    if (v >= n) return clipLine(s, n);
    return s + " ".repeat(n - v);
  }

  function clipLine(line, width) {
    const s = String(line);
    let visible = 0;
    let out = "";
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "\x1b") {
        const m = s.slice(i).match(/^\x1b\[[0-9;?]*[a-zA-Z]/);
        if (m) { out += m[0]; i += m[0].length - 1; continue; }
        out += s[i];
        continue;
      }
      if (visible >= width) { out += AN.d + "…" + AN.r; break; }
      out += s[i];
      visible++;
    }
    return out;
  }

  function scheduleRender() {
    if (dirty) return;
    dirty = true;
    setImmediate(() => { dirty = false; render(); });
  }

  function rowBox(inner, cols) {
    return "│ " + fitPlain(inner, Math.max(2, cols - 4)) + " │";
  }

  /** Syntax-tint a plain content line (markdown headings, bullets, evidence). */
  function colorLine(line) {
    const s = String(line);
    if (s.includes("\x1b")) return s; // already styled (welcome/help lines)
    const t = s.trimStart();
    if (t.startsWith("###")) return AN.b + AN.y + s + AN.r;
    if (t.startsWith("##")) return AN.b + AN.g + s + AN.r;
    if (t.startsWith("#")) return AN.b + AN.c + s + AN.r;
    if (/^[-=*]{3,}\s*$/.test(t)) return AN.p + s + AN.r; // horizontal rule
    if (t.startsWith("```")) return AN.p + s + AN.r; // code fence
    if (t.startsWith(">")) return AN.d + s + AN.r; // quote
    if (t.startsWith("_") && s.trimEnd().endsWith("_")) return AN.d + s + AN.r; // evidence note
    if (/^-\s*\*\*[^*]+\*\*/.test(s)) {
      return s.replace(/^(-\s*\*\*[^*]+\*\*)/, AN.y + AN.b + "$1" + AN.r);
    }
    if (/^(\s*)(\/[a-z]+)/.test(s)) {
      return s.replace(/^(\s*)(\/[a-z]+)/, "$1" + AN.c + "$2" + AN.r);
    }
    return s;
  }

  function render() {
    const { rows, cols, top, C, inRows, W } = layout();
    const len = shownLines().length;
    scroll = Math.max(0, Math.min(scroll, Math.max(0, len - C)));

    const frame = [];

    // top border with title
    const title = " " + AN.b + AN.c + "sigil" + AN.r + " · " + AN.b + name + AN.r + " ";
    const fill = Math.max(0, cols - visibleLen(title) - 3);
    frame.push(clipLine(AN.p + "┌─" + AN.r + title + AN.p + "─".repeat(fill) + "┐" + AN.r, cols));

    // header / status line
    const head = (status || hint) + "  ";
    frame.push(rowBox(head, cols));

    // divider
    frame.push(AN.p + "├" + "─".repeat(Math.max(1, cols - 2)) + "┤" + AN.r);

    // content (emit at most C physical rows, wrapping long lines)
    const shown = shownLines();
    let contentRows = 0;
    for (let i = 0; i < C && contentRows < C; i++) {
      const src = shown[scroll + i] ?? "";
      for (const seg of wrapLine(src, W)) {
        if (contentRows >= C) break;
        frame.push(rowBox(colorLine(seg), cols));
        contentRows++;
      }
    }
    while (contentRows < C) { frame.push(rowBox("", cols)); contentRows++; }

    // input box (green accent frame)
    frame.push(AN.ig + "├" + "─".repeat(Math.max(1, cols - 2)) + "┤" + AN.r);
    const bufLines = buffer.split("\n");
    const lastStart = Math.max(0, bufLines.length - inRows);
    for (let i = lastStart; i < bufLines.length; i++) {
      const isLast = i === bufLines.length - 1;
      const inner = bufLines[i] ?? "";
      const prompt = isLast && !inner
        ? AN.d + "paste a share link or chat text — or type /help" + AN.r
        : "";
      const text = (i === 0 ? AN.ig + "› " + AN.r : "  ") +
        (isLast && buffer ? AN.b : "") + inner + (isLast && buffer ? AN.r : "");
      frame.push(rowBox(isLast && !buffer ? prompt : text, cols));
    }
    frame.push(AN.ig + "└" + "─".repeat(Math.max(1, cols - 2)) + "┘" + AN.r);

    // spacer + centered footer (key hints stay accent-colored)
    frame.push("");
    const foot = AN.d +
      FOOTER.replace(/(Ctrl\+Alt\+C|Ctrl\+P|Ctrl\+Q|\/help)/g, (k) => AN.y + AN.b + k + AN.r + AN.d) +
      AN.r;
    frame.push(clipLine(" ".repeat(Math.max(0, Math.floor((cols - visibleLen(FOOTER)) / 2))) + foot, cols));

    // Repaint the whole centered panel on the alternate screen.
    const body = frame.map((l) => clipLine(l, cols)).join("\n");
    const cursorRow = top + 4 + C + inRows; // last input line (1-based on screen)
    const cursorCol = 4;
    let out = "\x1b[2J\x1b[" + (top + 1) + ";1H" + body + "\x1b[" + cursorRow + ";" + cursorCol + "H";
    if (rows !== prevRows || cols !== prevCols) {
      out = "\x1b[2J" + out;
      prevRows = rows;
      prevCols = cols;
    }
    process.stdout.write(out + "\x1b[?25h");
  }

  function exit() {
    process.stdout.write("\x1b[?2004l\x1b[?25h\x1b[?1049l");
    try { process.stdin.setRawMode(false); } catch { /* already off */ }
    process.stdin.pause();
    process.stdout.write(AN.d + "bye — reopen with: " + AN.c + "sigil " + name + AN.r + "\n");
    process.exit(0);
  }

  // ── start ─────────────────────────────────────────────────────────
  // Legacy Windows consoles (cmd.exe, cp437) garble the box-drawing glyphs;
  // switch the console to UTF-8 so the panel renders correctly. Best-effort,
  // harmless when already on a UTF-8 codepage or a modern terminal.
  if (process.platform === "win32" && process.stdout.isTTY) {
    try { execSync("chcp 65001", { stdio: "ignore" }); } catch { /* best-effort */ }
  }
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write("\x1b[?1049h\x1b[?2004h\x1b[2J"); // alternate screen + bracketed paste
  process.stdout.on("resize", scheduleRender);
  process.stdin.on("data", onData);
  process.on("SIGINT", exit);

  if (preload) {
    if (preload.url) await runUrl(preload.url);
    else if (preload.raw) generate(preload.raw);
  } else {
    scheduleRender();
  }
}