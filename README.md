# sigil

Deterministic, explainable chat-to-context extractor for [Claude](https://claude.ai) and
[Gemini](https://gemini.google.com) exports and share links. Turns a long conversation into a
compact, evidence-annotated context doc you can hand to any LLM (or yourself) to continue the work.

A sigil is a compact symbol that carries meaning — this tool distills a whole thread into the
small token that carries it forward.

**No AI, no API keys, zero dependencies.** Classic NLP only (TextRank + MMR for key sentences,
RAKE for keyphrases, tf-idf for topics, hand-written heuristics for goals/current-state/rules).
Network is used *only* when you pass a URL.

## Install

```sh
npm install -g @sigilware/sigil
# or run without installing:
npx @sigilware/sigil
```

Requires Node.js 18+.

## Usage

```sh
sigil                      # interactive session (like opencode) for current dir
sigil my-project           # interactive session for a named project
sigil < FILE > out.md      # read chat text from stdin
sigil chat.json            # analyze a Claude / Gemini export file
sigil https://claude.ai/share/...     # fetch a share link
sigil https://chatgpt.com/share/...   # fetch a ChatGPT share link
sigil --serve              # local web UI at http://localhost:8177
```

Share links: Claude (`claude.ai/share/…`), ChatGPT (`chatgpt.com/share/…`,
including legacy `chat.openai.com/share/…`), and general raw URLs (exports, gists,
pastebins) are fetched automatically through a reader proxy. Gemini share links
(`share.gemini.google/…`) are served by Google only to real browsers, so `sigil`
asks you to open the link and paste the conversation text instead — **unless** you
install an optional Gemini reader.

### Optional Gemini reader

`sigil` cannot read Gemini share pages itself (Google serves them only to real
browsers). Point it at a reader that can, with `SIGIL_GEMINI_READER`:

```sh
SIGIL_GEMINI_READER=linksnap sigil https://share.gemini.google/...
```

[`linksnap`](https://github.com/flame/linksnap) is a matching reader: it drives a
stealth browser, captures the conversation from Gemini's RPC layer, and prints it
as Markdown. When `SIGIL_GEMINI_READER` is unset, the built-in "open and paste"
guidance applies instead.

Two reader forms are supported:

- **CLI on PATH** (bare name, e.g. `linksnap`) — spawned as
  `linksnap <url> <flags>`; its stdout is the transcript. Default flags are
  `--stdout --headless`; override them with `SIGIL_GEMINI_ARGS` (space-separated,
  e.g. `--browser chrome --settle 2000`).
- **ES module file** (absolute/relative path or `file://` URL) — `import()`ed,
  then its default export (or named `fetchGemini`) is called:
  ```js
  export async function fetchGemini({ url }) {
    // open url in a real browser (Playwright/Puppeteer), grab the transcript…
    return { text: "…raw chat text or markdown…", title: "Optional title" };
  }
  ```
  `text` is required; `title` is optional.

Any reader error is reported with a hint to install/fix it or unset the variable.
Bare scoped names (`@scope/pkg`) and names with path separators are treated as
files; everything else runs as a CLI on PATH.

Options: `-o, --output <file>` · `--json` (also print evidence sections) · `--title <text>` ·
`--note <text>` · `--top-sentences <n>` · `--top-keyphrases <n>` · `--port <n>` · `--help` ·
`--version`

### Interactive shortcuts

| Key | Action |
| --- | --- |
| `Ctrl+Alt+C` | copy the context doc to your clipboard |
| `Ctrl+P` | toggle commands/help overlay |
| `Ctrl+Q` or `Ctrl+C` | quit |
| `Enter` | generate the doc (empty input: view current project) |
| `/show` · `/top` · `/bottom` · `/clear` · `/copy` | commands |

## How it works

1. **Parse** — detects Claude export / Claude share link / Gemini console / Gemini Takeout and
   normalizes the transcript (fences, roles, message ids).
2. **Extract** — goal, key topics + keyphrases, code blocks, files, glossary, questions, current
   state (last ask + next steps), and a compressed transcript (user turns verbatim, assistant
   turns kept at their highest-centrality sentences).
3. **Annotate** — every claim carries `_Evidence: …_` pointing at the exact turn it came from.
4. **Render** — one flat markdown doc: `## Goal`, `## Current state`, `## Rules`, `## Code`,
   `## Key topics`, `## Glossary`, `## Compressed transcript`, `## Stats`.

Projects are stored under `~/.sigil/projects.json` so you can resume them next time.

Every document is deterministic for the same input — grep the source, no black boxes.

## License

MIT