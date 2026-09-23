import test from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeUrl,
  claudeShareUuid,
  snapshotUrl,
  stripJinaWrapper,
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
