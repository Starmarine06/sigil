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
- (next) refactor: extract Gemini guidance error to tested helper, document share-link support in README

## Known next steps
1. Verify TUI wrapping in a real terminal (open the repo TUI, paste a Gemini link).
2. Publish **1.1.0** (needs fresh OTP), confirm `npm view @sigilware/sigil version` === `1.1.0`.
3. Anything else in README's feature list not yet done (transcript parsing `[^ ]+`,
   `/show` overlay, etc.).