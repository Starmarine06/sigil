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
- (next) feat: optional Gemini reader hook (`SIGIL_GEMINI_READER`) + broader Google-wall detection

## Gemini reader hook (NEW in this session)
- User is building their own npm package (headless browser) that can read Gemini share pages.
- sigil loads it **optionally** — zero hard deps. Env var `SIGIL_GEMINI_READER` = package name
  or file path. Global installs resolve the package name automatically (shared `node_modules`).
- Reader contract (in `src/fetch-link.js` → `fetchGeminiViaReader`):
  - module exports a **default fn or `fetchGemini`**
  - input `{ url }`, output `{ text, title? }`; `text` required
  - throws propagate to the CLI
- `fetchLink` now: Gemini share → try reader first (if configured) → else proxy → if the proxied
  body is Google-blocked → guidance error (URL on its own line).
- New pure helper `geminiBlocked(text)`: detects sign-in wall + in-app error shells
  ("Check your internet connection and try again…", "We could not complete your request…").
  Deliberately narrow so transcripts merely mentioning google/gemini aren't misclassified.
- Tests: 87 total (reader load via file path, env parsing, load-failure errors, wall detection).
- End-to-end verified: fixture reader `tests/fixtures/gemini-reader.mjs` returns a boho
  T-shirt transcript and the CLI produces a real context doc with it; without the reader the
  fallback produces the "real browsers / paste it" guidance.

## Known next steps
1. **User builds the Gemini reader npm package** (headless browser) — sigil's hook is ready,
   contract in README. Test via `SIGIL_GEMINI_READER=browser-reader node bin/sigil.js <gemini-url>`.
2. Verify TUI wrapping in a real terminal (open the repo TUI, paste a Gemini link).
3. Publish **1.1.0** (needs fresh OTP), confirm `npm view @sigilware/sigil version` === `1.1.0`.
4. Anything else in README's feature list not yet done (transcript parsing `[^ ]+`,
   `/show` overlay, etc.).