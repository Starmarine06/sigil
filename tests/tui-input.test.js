import test from "node:test";
import assert from "node:assert/strict";
import { createDecoder, decodeInput, sanitizeTerminal } from "../src/tui-input.js";

/** Apply events to a buffer the way the TUI does, and return everything. */
function run(chunks, opts = {}) {
  const s = createDecoder();
  if (opts.now) s.now = opts.now;
  let buffer = "";
  const events = [];
  for (const c of chunks) {
    for (const ev of decodeInput(s, c)) {
      events.push(ev);
      if (ev.t === "text") buffer += ev.v;
      if (ev.t === "submit") buffer = "";
      if (ev.t === "backspace") buffer = buffer.slice(0, -1);
    }
  }
  return { s, buffer, events };
}
const types = (r) => r.events.map((e) => e.t);

test("typed text produces text events in order", () => {
  const r = run(["hello"]);
  assert.equal(r.buffer, "hello");
  assert.deepEqual(types(r), ["text"]);
});

test("single Enter submits", () => {
  const r = run(["https://example.com", "\r"]);
  assert.deepEqual(types(r), ["text", "submit"]);
  assert.equal(r.buffer, "");
});

test("CRLF normalizes to a single newline", () => {
  const r = run(["a\r\nb\r\nc"]);
  assert.equal(r.buffer, "a\nb\nc");
  assert.ok(!types(r).includes("submit"));
});

test("single-line paste with trailing newline does NOT auto-submit", () => {
  const r = run(["https://example.com\r"]);
  assert.equal(r.buffer, "https://example.com\n");
  assert.ok(!types(r).includes("submit"));
});

test("multi-line no-marker paste lands as one buffer, never a partial submit", () => {
  const r = run(["line1\r\nline2\r\nline3\r\n"]);
  assert.equal(r.buffer, "line1\nline2\nline3\n");
  assert.ok(!types(r).includes("submit"));
});

test("multi-chunk no-marker paste accumulates across chunks", () => {
  const r = run(["line1\r\nline2\r\n", "line3\r\n"]);
  assert.equal(r.buffer, "line1\nline2\nline3\n");
  assert.ok(!types(r).includes("submit"));
});

test("bracket paste adds text without submitting, strips trailing newline", () => {
  const r = run(["\x1b[200~line1\r\nline2\r\n\x1b[201~"]);
  assert.equal(r.buffer, "line1\nline2");
  assert.ok(!types(r).includes("submit"));
});

test("bracket paste strips ANSI sequences from clipboard content", () => {
  const r = run(["\x1b[200~\x1b[31mhi\x1b[0m\x1b[201~"]);
  assert.equal(r.buffer, "hi");
});

test("paste markers split across chunk boundaries still decode", () => {
  const r = run(["\x1b[20", "0~split\x1b[20", "1~"]);
  assert.equal(r.buffer, "split");
  assert.ok(!types(r).includes("submit"));
});

test("stuck paste (lost close marker) self-heals after a quiet window", () => {
  const s = createDecoder();
  let t = 1000;
  s.now = () => t;
  assert.deepEqual(decodeInput(s, "\x1b[200~abc"), []);
  t = 4000; // 3s with no input → paste is stuck
  const evs = decodeInput(s, "d");
  assert.deepEqual(evs, [{ t: "text", v: "abc" }, { t: "text", v: "d" }]);
  assert.equal(s.inPaste, false);
});

test("scroll keys emit scroll events; unknown CSI and Alt keys are dropped", () => {
  const r = run([
    "\x1b[A", "\x1b[B", "\x1b[5~", "\x1b[6~", "\x1b[H", "\x1b[F",
    "\x1b[1;5C", "\x1bd", "x",
  ]);
  assert.deepEqual(
    r.events.filter((e) => e.t === "scroll" || e.t === "scrollTo"),
    [
      { t: "scroll", d: -1 },
      { t: "scroll", d: 1 },
      { t: "scroll", d: -50 },
      { t: "scroll", d: 50 },
      { t: "scrollTo", pos: "top" },
      { t: "scrollTo", pos: "bottom" },
    ]
  );
  assert.equal(r.buffer, "x");
});

test("backspace removes a character", () => {
  const r = run(["ab\x7f"]);
  assert.equal(r.buffer, "a");
});

test("typed line then real Enter submits (separate chunks, cold)", () => {
  const r = run(["my question", "\n"]);
  assert.deepEqual(types(r), ["text", "submit"]);
});

test("paste followed by a later Enter submits the whole paste", () => {
  const r = run(["\x1b[200~line1\r\nline2\x1b[201~", "abc"]);
  assert.equal(r.buffer, "line1\nline2abc");
  // a cold Enter (seconds later, so the paste burst has cooled) submits
  const s = createDecoder();
  let t = 0;
  s.now = () => t;
  const first = decodeInput(s, "line1\r\nline2\r\n");
  t = 5000;
  const rest = decodeInput(s, "\r");
  assert.ok(first.every((e) => e.t === "text"), "paste produces only text");
  assert.deepEqual(rest, [{ t: "submit" }]);
});

test("sanitizeTerminal removes CSI, OSC and control bytes", () => {
  assert.equal(
    sanitizeTerminal("a\x1b[31mb\x1b]0;title\x07c\x1bd\x00e"),
    "abcde"
  );
  assert.equal(sanitizeTerminal("plain text"), "plain text");
});

test("Ctrl+C exits even mid-paste (bracket content)", () => {
  const r = run(["\x1b[200~hi", "\x03"]);
  assert.ok(types(r).includes("exit"));
});

test("Ctrl+Q quits with the same weight as Ctrl+C", () => {
  const r = run(["abc", "\x11"]);
  assert.deepEqual(types(r), ["text", "exit"]);
});

test("Ctrl+P emits a commands event", () => {
  const r = run(["abc", "\x10"]);
  assert.deepEqual(types(r), ["text", "commands"]);
});

test("Ctrl+Alt+C copies (ESC+Ctrl+C)", () => {
  const r = run(["\x1b\x03"]);
  assert.deepEqual(types(r), ["copy"]);
});

test("Ctrl+Alt+C copies (CSI 27;6;99~ and CSI 99;6u)", () => {
  assert.deepEqual(types(run(["\x1b[27;6;99~"])), ["copy"]);
  assert.deepEqual(types(run(["\x1b[99;6u"])), ["copy"]);
});