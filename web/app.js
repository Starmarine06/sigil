import { analyze } from "/src/index.js";

const $ = (id) => document.getElementById(id);
const drop = $("drop");
const fileInput = $("file");
const paste = $("paste");
const title = $("title");
const go = $("go");
const out = $("out");
const md = $("md");
const jsonEl = $("json");
const copyBtn = $("copy");
const dlBtn = $("dl");
const toast = document.createElement("div");
toast.className = "toast";
document.body.appendChild(toast);

let lastMarkdown = "";

drop.addEventListener("click", () => fileInput.click());
["dragenter", "dragover"].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("dragover"); })
);
["dragleave", "drop"].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("dragover"); })
);
drop.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) handleFile(f);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
  fileInput.value = "";
});

async function handleFile(file) {
  try {
    const text = await file.text();
    paste.value = text.length > 5_000_000 ? text.slice(0, 5_000_000) + "\n…[truncated]" : text;
    showToast(`Loaded ${file.name}`);
    run();
  } catch (err) {
    showToast("Could not read file: " + err.message, true);
  }
}

go.addEventListener("click", run);
paste.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run();
});
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "c") {
    e.preventDefault();
    if (lastMarkdown) copyBtn.click();
  }
});

const isUrl = (s) => /^https?:\/\/\S+/i.test(String(s).trim());

function run() {
  const text = paste.value;
  if (!text.trim()) return showToast("Paste or drop a chat (or a share link) first", true);
  if (isUrl(text)) return runUrl(text);
  runLocal(text);
}

function runLocal(text) {
  let result;
  try {
    result = analyze(text, { title: title.value || undefined });
  } catch (err) {
    return showToast("Error: " + (err && err.message ? err.message : err), true);
  }
  if (result.error) return showToast(result.error, true);
  render(result, "Generated " + result.sections.stats.messageCount + " messages → context");
}

async function runUrl(text) {
  showToast("Fetching " + text.replace(/^https?:\/\//, "") + "…");
  let res;
  try {
    res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: text.trim(), title: title.value || undefined }),
    });
  } catch (err) {
    return showToast("Fetch failed: " + (err && err.message ? err.message : err), true);
  }
  let data;
  try {
    data = await res.json();
  } catch {
    return showToast("Bad response from server", true);
  }
  if (!res.ok) return showToast(data.error || ("Server error " + res.status), true);
  render(data, "Fetched link → " + data.sections.stats.messageCount + " messages");
}

function render(data, toastMsg) {
  lastMarkdown = data.markdown;
  md.innerHTML = renderMarkdown(data.markdown);
  jsonEl.textContent = JSON.stringify(data.sections, null, 2);
  out.classList.remove("hidden");
  showToast(toastMsg);
}

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(lastMarkdown);
    showToast("Copied to clipboard");
  } catch {
    selectText();
  }
});

dlBtn.addEventListener("click", () => {
  const blob = new Blob([lastMarkdown], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "context.md";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

function selectText() {
  const range = document.createRange();
  range.selectNodeContents(md);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function showToast(msg, isError = false) {
  toast.textContent = msg;
  toast.style.background = isError ? "#d0666a" : "var(--green)";
  toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove("show"), 2200);
}

// ── minimal safe markdown → HTML (headings, code, lists, quotes, tables) ──
function renderMarkdown(mdText) {
  const lines = mdText.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inCode = false;
  let codeBuf = [];

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${esc(codeBuf.join("\n"))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    html.push(mdLine(line));
  }
  return html.join("");
}

function mdLine(line) {
  const t = line;
  if (/^###\s/.test(t)) return `<h3>${inline(t.replace(/^###\s/, ""))}</h3>`;
  if (/^##\s/.test(t)) return `<h2>${inline(t.replace(/^##\s/, ""))}</h2>`;
  if (/^#\s/.test(t)) return `<h1>${inline(t.replace(/^#\s/, ""))}</h1>`;
  if (/^---+\s*$/.test(t)) return "<hr />";
  if (/^\*\*_.*_\*\*$/.test(t)) return `<em>${inline(t.replace(/^\*\*_\*?_\*?|_\*\*$/g, ""))}</em>`;
  if (/^> /.test(t)) return `<blockquote>${inline(t.replace(/^> /, ""))}</blockquote>`;
  if (/^\|.*\|$/.test(t)) return tableRow(t);
  if (/^[-*•]\s+/.test(t)) return `<li>${inline(t.replace(/^[-*•]\s+/, ""))}</li>`;
  if (/^  ─ /.test(t)) return `<div class="ev">${inline(t.replace(/^  ─ /, ""))}</div>`;
  if (/^\s*_/.test(t)) return `<em>${inline(t.replace(/_+$/, ""))}</em>`;
  // accumulate lists: we can't group without state; render simple
  return inline(t) ? `<p>${inline(t)}</p>` : "";
}

function tableRow(t) {
  const cells = t.replace(/^\||\|$/g, "").split("|");
  if (cells.every((c) => /^[:\-\s]+$/.test(c))) return "";
  const tag = t.includes("---") ? "td" : "th";
  return `<div class="trow"><${tag}>${cells.map((c) => inline(c.trim())).join(`</${tag}><${tag}>`)}</${tag}></div>`;
}

function inline(t) {
  return esc(t)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}