import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  looksLikeUrl,
  claudeShareUuid,
  snapshotUrl,
  stripJinaWrapper,
  proxyTarget,
  isChatgptShare,
  isGeminiShare,
  geminiGuidanceError,
  geminiReaderName,
  fetchGeminiViaReader,
  geminiBlocked,
  geminiCliFlags,
  runGeminiCli,
} from "../src/fetch-link.js";

test("looksLikeUrl detects http(s) URLs and rejects everything else", () => {
  assert.equal(looksLikeUrl("https://claude.ai/share/13740b08-21f2-4b9a-a471-6670a4dfed71"), true);
  assert.equal(looksLikeUrl("  http://example.com/a.json  "), true);
  assert.equal(looksLikeUrl("tests/fixtures/claude-export.json"), false);
  assert.equal(looksLikeUrl("not a link"), false);
  assert.equal(looksLikeUrl("{ \"json\": true }"), false);
});

test("claudeShareUuid extracts the uuid from share URLs only", () => {
  const uuid = claudeShareUuid("https://claude.ai/share/13740b08-21f2-4b9a-a471-6670a4dfed71");
  assert.equal(uuid, "13740b08-21f2-4b9a-a471-6670a4dfed71");
  assert.equal(claudeShareUuid("https://claude.ai/share/13740b08-21f2-4b9a-a471-6670a4dfed71?x=1"), null);
  assert.equal(claudeShareUuid("https://claude.ai/project/x"), null);
  assert.equal(claudeShareUuid("https://example.com/share/13740b08-21f2-4b9a-a471-6670a4dfed71"), null);
});

test("snapshotUrl routes claude share snapshots through the reader proxy", () => {
  const url = snapshotUrl("13740b08-21f2-4b9a-a471-6670a4dfed71");
  assert.ok(url.startsWith("https://r.jina.ai/https://claude.ai/api/chat_snapshots/13740b08-21f2-4b9a-a471-6670a4dfed71?"));
  assert.ok(url.includes("rendering_mode=messages"));
});

test("stripJinaWrapper removes the reader proxy enclosure, keeps JSON body", () => {
  const wrapped =
    "Title: Hyprland rice\n\nURL Source: https://claude.ai/api/chat_snapshots/x\n\n" +
    "Markdown Content:\n{\"uuid\":\"x\",\"chat_messages\":[{\"sender\":\"human\"}]}\n";
  const out = stripJinaWrapper(wrapped);
  assert.equal(JSON.parse(out).uuid, "x");
});

test("stripJinaWrapper passes through bodies with no marker", () => {
  assert.equal(stripJinaWrapper("{\"a\":1}"), "{\"a\":1}");
  assert.equal(stripJinaWrapper("plain text"), "plain text");
});

test("proxyTarget routes claude, chatgpt, and gemini share pages through the reader proxy", () => {
  const chatgpt = "https://chatgpt.com/share/6ab4334f-17d0-83e8-9285-74a36561a46e";
  assert.equal(proxyTarget(chatgpt), `https://r.jina.ai/${chatgpt}`);
  assert.equal(
    proxyTarget("https://chat.openai.com/share/6ab4334f-17d0-83e8-9285-74a36561a46e"),
    "https://r.jina.ai/https://chat.openai.com/share/6ab4334f-17d0-83e8-9285-74a36561a46e"
  );
  assert.equal(proxyTarget("https://share.gemini.google/KP69cv0LJ3nw"), "https://r.jina.ai/https://share.gemini.google/KP69cv0LJ3nw");
  assert.ok(
    proxyTarget("https://claude.ai/share/13740b08-21f2-4b9a-a471-6670a4dfed71").includes(
      "https://r.jina.ai/https://claude.ai/api/chat_snapshots/13740b08-21f2-4b9a-a471-6670a4dfed71"
    )
  );
  assert.equal(proxyTarget("https://example.com/x.json"), "https://example.com/x.json");
  assert.equal(proxyTarget("not a url"), "not a url");
});

test("isChatgptShare and isGeminiShare recognize only their own domains", () => {
  assert.equal(isChatgptShare("https://chatgpt.com/share/6ab4334f-17d0-83e8-9285-74a36561a46e"), true);
  assert.equal(isChatgptShare("https://chat.openai.com/share/6ab4334f-17d0-83e8-9285-74a36561a46e"), true);
  assert.equal(isChatgptShare("https://chatgpt.com/c/abc"), false);
  assert.equal(isChatgptShare("https://claude.ai/share/13740b08-21f2-4b9a-a471-6670a4dfed71"), false);
  assert.equal(isGeminiShare("https://share.gemini.google/KP69cv0LJ3nw"), true);
  assert.equal(isGeminiShare("https://gemini.google.com/app"), false);
  assert.equal(isGeminiShare("https://chatgpt.com/share/6ab4334f-17d0-83e8-9285-74a36561a46e"), false);
});

test("geminiGuidanceError puts the share URL on its own final line", () => {
  const url = "https://share.gemini.google/PJgxYtV0aZrQ";
  const msg = geminiGuidanceError(url);
  const lines = msg.split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /real browsers/i);
  assert.match(lines[1], /paste it/);
  assert.equal(lines[2], url);
});

test("geminiReaderName reads SIGIL_GEMINI_READER, trims it, returns null when unset", () => {
  const had = "SIGIL_GEMINI_READER" in process.env;
  const backup = process.env.SIGIL_GEMINI_READER;
  try {
    delete process.env.SIGIL_GEMINI_READER;
    assert.equal(geminiReaderName(), null);
    process.env.SIGIL_GEMINI_READER = "  @scoop/gemini-reader  ";
    assert.equal(geminiReaderName(), "@scoop/gemini-reader");
    process.env.SIGIL_GEMINI_READER = "   ";
    assert.equal(geminiReaderName(), null);
  } finally {
    if (had) process.env.SIGIL_GEMINI_READER = backup;
    else delete process.env.SIGIL_GEMINI_READER;
  }
});

test("fetchGeminiViaReader returns null with no reader configured", async () => {
  const had = "SIGIL_GEMINI_READER" in process.env;
  const backup = process.env.SIGIL_GEMINI_READER;
  try {
    delete process.env.SIGIL_GEMINI_READER;
    assert.equal(await fetchGeminiViaReader("https://share.gemini.google/PJgxYtV0aZrQ"), null);
  } finally {
    if (had) process.env.SIGIL_GEMINI_READER = backup;
    else delete process.env.SIGIL_GEMINI_READER;
  }
});

test("fetchGeminiViaReader loads a reader from a file path and returns its text", async () => {
  const had = "SIGIL_GEMINI_READER" in process.env;
  const backup = process.env.SIGIL_GEMINI_READER;
  const fixture = fileURLToPath(new URL("./fixtures/gemini-reader.mjs", import.meta.url));
  try {
    process.env.SIGIL_GEMINI_READER = fixture;
    const out = await fetchGeminiViaReader("https://share.gemini.google/PJgxYtV0aZrQ");
    assert.ok(out);
    assert.ok(out.text.startsWith("**human:** Design"));
    assert.match(out.text, /Adventure Awaits/);
    assert.equal(out.title, "Custom Boho Adventure T-Shirt Design");
  } finally {
    if (had) process.env.SIGIL_GEMINI_READER = backup;
    else delete process.env.SIGIL_GEMINI_READER;
  }
});

test("fetchGeminiViaReader reports a reader that cannot be loaded", async () => {
  const had = "SIGIL_GEMINI_READER" in process.env;
  const backup = process.env.SIGIL_GEMINI_READER;
  try {
    process.env.SIGIL_GEMINI_READER = path.join("__no_such_pkg__", "reader.mjs");
    await assert.rejects(
      fetchGeminiViaReader("https://share.gemini.google/PJgxYtV0aZrQ"),
      /could not be loaded/
    );
  } finally {
    if (had) process.env.SIGIL_GEMINI_READER = backup;
    else delete process.env.SIGIL_GEMINI_READER;
  }
});

test("geminiCliFlags defaults to stdout+headless and honors SIGIL_GEMINI_ARGS", () => {
  const had = "SIGIL_GEMINI_ARGS" in process.env;
  const backup = process.env.SIGIL_GEMINI_ARGS;
  try {
    delete process.env.SIGIL_GEMINI_ARGS;
    assert.deepEqual(geminiCliFlags(), ["--stdout", "--headless"]);
    process.env.SIGIL_GEMINI_ARGS = " --browser chrome  --settle 2000 ";
    assert.deepEqual(geminiCliFlags(), ["--browser", "chrome", "--settle", "2000"]);
    process.env.SIGIL_GEMINI_ARGS = "   ";
    assert.deepEqual(geminiCliFlags(), ["--stdout", "--headless"]);
  } finally {
    if (had) process.env.SIGIL_GEMINI_ARGS = backup;
    else delete process.env.SIGIL_GEMINI_ARGS;
  }
});

test("runGeminiCli executes a command and captures stdout", async () => {
  const stub = fileURLToPath(new URL("./fixtures/linksnap-stub.mjs", import.meta.url));
  const text = await runGeminiCli(process.execPath, [stub, "--stdout"]);
  assert.match(text, /linksnap stub/);
});

test("runGeminiCli rejects when the command cannot run", async () => {
  await assert.rejects(runGeminiCli("__definitely_not_a_real_command__", ["x"]));
});

test("fetchGeminiViaReader reports a CLI reader that cannot be run", async () => {
  const had = "SIGIL_GEMINI_READER" in process.env;
  const backup = process.env.SIGIL_GEMINI_READER;
  try {
    process.env.SIGIL_GEMINI_READER = "__no_such_reader_bin__";
    await assert.rejects(
      fetchGeminiViaReader("https://share.gemini.google/PJgxYtV0aZrQ"),
      /could not be run/
    );
  } finally {
    if (had) process.env.SIGIL_GEMINI_READER = backup;
    else delete process.env.SIGIL_GEMINI_READER;
  }
});

test("geminiBlocked recognizes Google blocking pages, not real transcripts", () => {
  assert.equal(geminiBlocked("sign in to continue\naccounts.google.com/ServiceLogin"), true);
  assert.equal(geminiBlocked("Check your internet connection and try again"), true);
  assert.equal(geminiBlocked("We could not complete your request.\nGoogle apps\nSign in"), true);
  assert.equal(
    geminiBlocked("Google apps\nCheck your internet connection and try again\nCheck your internet connection and try again"),
    true
  );
  assert.equal(geminiBlocked("**human:** Design a boho T-shirt\n**assistant:** Here's a concept."), false);
  assert.equal(geminiBlocked("let's talk about google gemini bard apps and more — long real conversation continues here..."), false);
});
