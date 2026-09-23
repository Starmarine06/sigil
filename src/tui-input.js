/**
 * Pure input decoder for the TUI. Turns raw terminal/keyboard bytes (including
 * bracketed and un-marked pastes) into a stream of events. No node deps, so it
 * is unit-testable without a TTY.
 *
 * Guarantees:
 *  - Paste content is NEVER auto-submitted: a newline that rides along with a
 *    paste (same chunk or hot after it) becomes part of the buffer instead.
 *    Only a cold, standalone Enter submits.
 *  - CRLF / lone CR / LF all normalize to a single "\n".
 *  - ANSI/OSC/control bytes are stripped from everything incoming, so pasted
 *    clipboard content can't inject terminal sequences.
 *  - A bracket-paste marker left open (close marker lost) self-heals: if no
 *    input arrives for STUCK_MS, the paste is flushed and input recovers.
 *  - Ctrl+C works even mid-paste.
 */

const PAUSE_MS = 120; // text + "\n" this close to it = paste-trailing newline
const BURST_MS = 150; // how long a multi-line burst stays "hot"
const STUCK_MS = 1000; // inPaste open with no input for this long → force close

const KEYMAP = {
  "\x1b[A": { t: "scroll", d: -1 }, // up
  "\x1b[B": { t: "scroll", d: 1 }, // down
  "\x1b[5~": { t: "scroll", d: -50 }, // page up
  "\x1b[6~": { t: "scroll", d: 50 }, // page down
  "\x1b[H": { t: "scrollTo", pos: "top" }, // home
  "\x1b[1~": { t: "scrollTo", pos: "top" },
  "\x1b[F": { t: "scrollTo", pos: "bottom" }, // end
  "\x1b[4~": { t: "scrollTo", pos: "bottom" },
};

export function createDecoder() {
  return {
    inPaste: false,
    pasteBuf: "",
    seq: "",
    inBurst: false,
    lastTextAt: 0,
    lastBreakAt: 0,
    lastChunkAt: 0,
    now: () => Date.now(),
  };
}

/** Strip ANSI CSI / OSC sequences and other control bytes. */
export function sanitizeTerminal(s) {
  return String(s)
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

/** Mutates `s` (created by createDecoder) and returns an array of events. */
export function decodeInput(s, chunk) {
  const events = [];
  const now = s.now();

  if (s.inPaste && now - s.lastChunkAt > STUCK_MS) closePaste(s, events);
  s.lastChunkAt = now;
  if (now - s.lastBreakAt > BURST_MS) s.inBurst = false;

  const str = String(chunk);
  const breaksInChunk = (str.match(/[\r\n]/g) || []).length;
  let acc = ""; // consecutive printable chars coalesce into one text event
  let chunkHadText = false;

  const flush = () => {
    if (acc) {
      events.push({ t: "text", v: acc });
      acc = "";
    }
  };

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    // Ctrl+C / Ctrl+Z / Ctrl+Q always quit — even mid-paste — unless an ESC
    // sequence is in progress, where \x03 means Alt+Ctrl+C (copy) instead.
    if (ch === "\x03" || ch === "\x1a" || ch === "\x11") {
      if (s.inPaste || s.seq === "") {
        flush();
        events.push({ t: "exit" });
        continue;
      }
    }

    if (s.inPaste) {
      if (ch === "\r") {
        if (str[i + 1] === "\n") i++;
        s.pasteBuf += "\n";
      } else if (ch === "\n") {
        s.pasteBuf += "\n";
      } else {
        s.pasteBuf += ch; // raw; ANSI/control are stripped at flush
      }
      // The close marker always ends the paste, so just look for it at the
      // tail of what we've spooled (markers split across chunks work too).
      if (s.pasteBuf.endsWith("\x1b[201~")) {
        s.pasteBuf = s.pasteBuf.slice(0, -6);
        closePaste(s, events);
      }
      continue;
    }

    if (ch === "\x10") {
      // Ctrl+P → command palette (opencode-style)
      flush();
      events.push({ t: "commands" });
      continue;
    }

    if (ch === "\x1b") {
      flush();
      s.seq = ch;
      continue;
    }

    if (s.seq) {
      s.seq += ch;
      const q = s.seq;
      if (q === "\x1b[200~") {
        s.inPaste = true;
        s.pasteBuf = "";
        s.seq = "";
        continue;
      }
      if (q === "\x1b[201~") {
        s.inPaste = false;
        continue; // ignored outside paste
      }
      // Ctrl+Alt+C → copy context (ESC+Ctrl+C, CSI 27;6;99~, CSI 99;6u).
      if (q === "\x1b\x03" || q === "\x1b[27;6;99~" || q === "\x1b[99;6u") {
        events.push({ t: "copy" });
        s.seq = "";
        continue;
      }
      if (KEYMAP[q]) {
        events.push(KEYMAP[q]);
        s.seq = "";
        continue;
      }
      if (q.startsWith("\x1b]")) {
        // OSC: drop until BEL or ST; cap as a safeguard.
        if (q.endsWith("\x07") || q.endsWith("\x1b\\") || q.length > 64) s.seq = "";
        continue;
      }
      if (/^\x1b\[[0-9;?]*[a-zA-Z]$/.test(q)) {
        s.seq = ""; // complete CSI we don't handle (e.g. mouse/color reports)
        continue;
      }
      if (q.length === 2 && !q.startsWith("\x1b[")) {
        s.seq = ""; // ESC + single key (Alt+key): drop both
        continue;
      }
      if (q.length > 16) s.seq = "";
      continue;
    }

    if (ch === "\r" || ch === "\n") {
      flush();
      chunkHadText ||= acc.length > 0;
      if (ch === "\r" && str[i + 1] === "\n") i++; // CRLF → one newline
      if (s.inBurst || breaksInChunk >= 2) {
        s.inBurst = true;
        events.push({ t: "text", v: "\n" });
      } else if (chunkHadText && s.now() - s.lastTextAt <= PAUSE_MS) {
        events.push({ t: "text", v: "\n" }); // paste-trailing newline
      } else {
        events.push({ t: "submit" }); // cold, standalone Enter
      }
      s.lastBreakAt = s.now();
      continue;
    }

    if (ch === "\x7f" || ch === "\x08") {
      flush();
      events.push({ t: "backspace" });
      continue;
    }

    if (ch === "\t" || ch >= " " || ch > "\x7e") {
      acc += ch;
      s.lastTextAt = s.now();
      chunkHadText = true;
    }
  }

  flush();
  return events;
}

function closePaste(s, events) {
  s.inPaste = false;
  const text = sanitizeTerminal(s.pasteBuf).replace(/^[\n]+|[\n]+$/g, "");
  if (text) events.push({ t: "text", v: text });
  s.pasteBuf = "";
}