import test from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeUrl,
  claudeShareUuid,
  snapshotUrl,
  stripJinaWrapper,
  proxyTarget,
  isChatgptShare,
  isGeminiShare,
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
