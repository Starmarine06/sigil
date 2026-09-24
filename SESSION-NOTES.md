# sigil — resume notes

Short state of play so work can be picked up later. See README for usage.

## What this project is
`sigil` — zero-dependency, deterministic chat-to-context extractor (CLI + TUI + web UI).
Node >= 18, `"type": "module"`, no AI/NLP models (classical algorithms in `src/nlp/`:
RAKE, TextRank, MMR, Luhn). Tests: `npm test` (node:test). Cross-OS: Windows/Linux/macOS.

## Publish state (IMPORTANT for next session)
- npm identity: `dev_nambiar` — 2FA is "auth-and-writes", so **every publish needs a fresh OTP**:
  `npm publish --access public --otp=<code>` (user runs it or provides a code).
- npm org/scope: **`@sigilware`** (web-created; CLI cannot create orgs). `dev_nambiar` is owner.
- **Published & live: `@sigilware/sigil@1.0.0`** (public access).
- Locally built but **NOT yet published: `1.1.0`** (share-link support + TUI fix below).
- Repo: GitHub `Starmarine06/sigil`, branch `main`. Local: `C:\Users\flame\Desktop\context-saver`.
- Install for test: `npm install -g --prefix C:\Users\flame\AppData\Local\Temp\opencode\sigil-test .\sigilware-sigil-1.1.0.tgz` then run that prefix's `sigil.cmd`.

## What was done in this work session
1. **Share-link support for ChatGPT** (`chatgpt.com/share` + legacy `chat.openai.com/share`) and
   -- Claude (`claude.ai/share/<uuid>`): routes through the reader proxy `https://r.jina.ai/<url>`.
   New exports in `src/fetch-link.js`: `proxyTarget`, `isChatgptShare`, `isGeminiShare`.
   ChatGPT transcripts are labeled as assistant turns (`**Assistant:**` prepend in `bin/sigil.js`).
2. **HTTP 429 rate-limit fix**: `fetchLink` now retries with backoff (`fetchWithRetry`, 3 tries).
   The user's original `429` came from published 1.0.0 doing direct fetches (no proxy).
3. **Gemini shares: hard Google wall** — do not re-investigate.
   Google serves `share.gemini.google/<id>` (and resolved `gemini.google.com/share/<id>?skid=…`)
   content ONLY to real browsers via an undocumented session-token endpoint. Verified via Node fetch,
   `curl.exe`, reader proxy, resolved short links, consent cookies: no server-side anonymous path
   exists (content isn't even in the 850KB HTML shell). Decision: Gemini links get a guidance error
   telling the user to open in browser and **copy-paste** the conversation.
4. **TUI status/error wrapping** (`src/tui.js`): the header used to be one boxed row that
   `clipLine` truncated with `…` mid-URL. Now wrapped across multiple rows via new ANSI-safe
   `wrapStatus()`; header rows fed into `layout(sbRows)` and `cursorRow` math. Short statuses
   still render as a single row. Error text in `src/fetch-link.js` puts the URL on its own line
   so it is never cut off.

## Commits for this session's changes
- `a102b9e` feat: chatgpt and gemini share link support via reader proxy (+1.1.0)
- `12352b3` fix: retry on rate limits; replace misleading private-share error with browser guidance for Gemini shares
- `245d435` fix: wrap TUI status/error header across rows instead of clipping with ellipsis
- `8d8594a` refactor: extract Gemini guidance error to tested helper, document share-link support in README
- (next) feat: optional Gemini reader hook — CLI (`linksnap`) or ES-module file

## Gemini reader hook (NEW in this session)
- **`linksnap`** (user's own package, https://github.com/flame/linksnap, published `linksnap@1.0.0`,
  globally installed) is the reader. It's a CLI (`bin: linksnap`) that drives a stealth browser,
  captures Gemini's batchexecute RPC, emits Markdown. Its module entry auto-runs the CLI on import,
  so sigil must NOT `import('linksnap')` in-process — it spawns it instead.
- sigil keeps **zero hard dependencies**: the reader is optional, discovered at runtime.
- `SIGIL_GEMINI_READER` selectors (in `src/fetch-link.js`):
  - **bare name / executable** (e.g. `linksnap`) → CLI mode: `runGeminiCli(name, [url, ...geminiCliFlags()])`
  - **file path / file: URL** → module mode: `import()` the file, call default export or `fetchGemini`
    with `{ url }` → `{ text, title? }`
- CLI subprocess details (Win32):
  - `.cmd` shims need `cmd.exe /d /c`; hand-built command line passed with
    `windowsVerbatimArguments: true` (Node's default quoting would mangle hand-built quotes),
    wrapped in an extra pair of quotes because `cmd /c` strips the outer pair.
    Avoids spawn()'s `shell:true` → no DEP0190 deprecation warning.
  - `SIGIL_GEMINI_ARGS` overrides default flags `--stdout --headless`.
  - `AbortSignal.timeout(240000)` kill-switch; non-zero exit + empty stdout → error with stderr tail.
- `isFileSpecifier`: scoped names (`@scope/…`) stay bare; anything else with a path separator,
  `./`/`../`, a drive, or a leading slash is treated as a file path.
- Live-verified: `SIGIL_GEMINI_READER=linksnap node bin/sigil.js <real gemini url> -o out.md`
  → real T-shirt-design transcript extracted, `# Context:` doc written.
- Tests: 91 total (was 87; +CLI capture, +CLI failure, +flags default/override, +cannot-run
  wrapper). New fixture `tests/fixtures/linksnap-stub.mjs`.

## Known next steps
1. **PUBLISHED 1.1.0** (user ran it) — `npm view @sigilware/sigil version` === `1.1.0`, `latest` tag = 1.1.0. 
2. Verify TUI wrapping in a real terminal (open the repo TUI, paste a Gemini link).
3. Anything else in README's feature list not yet done (transcript parsing `[^ ]+`,
   `/show` overlay, etc.).
4. Optional: fold linksnap's segment list / filters (`--list`) into sigil later.