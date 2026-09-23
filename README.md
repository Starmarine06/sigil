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
sigil https://claude.ai/share/...   # fetch a share link
sigil --serve              # local web UI at http://localhost:8177
```

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