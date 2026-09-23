import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInput } from "../src/index.js";
import { fixtureChat, fixture } from "./helpers.js";

test("claude export parses messages and roles", () => {
  const chat = fixtureChat("claude-export");
  assert.equal(chat.source, "claude");
  assert.equal(chat.messages.filter((m) => m.role === "user").length, 6);
  assert.equal(chat.messages.filter((m) => m.role === "assistant").length, 7);
  assert.equal(chat.title, "Build a tiny RSS reader");
  assert.ok(chat.models.includes("claude-sonnet"));
  assert.ok(chat.messages[0].text.includes("tiny RSS reader"));
});

test("claude export content blocks flatten", () => {
  const chat = fixtureChat("claude-export");
  const assistant = chat.messages.find((m) => m.role === "assistant");
  assert.ok(assistant.text.includes("schema.prisma"));
  assert.ok(assistant.text.includes("```prisma"));
});

test("claude share snapshot parses messages and roles", () => {
  const chat = fixtureChat("claude-share");
  assert.equal(chat.source, "claude-share");
  assert.equal(chat.messages.filter((m) => m.role === "user").length, 20);
  assert.equal(chat.messages.filter((m) => m.role === "assistant").length, 33);
  assert.equal(chat.title, "Hyprland rice setup on Arch Linux");
  assert.ok(chat.messages[0].text.includes("archlinux"));
});

test("claude share snapshot parses as string input", () => {
  const raw = fixture("claude-share.json");
  const chat = parseInput(raw);
  assert.equal(chat.source, "claude-share");
  assert.equal(chat.messages.length, 53);
});

test("gemini takeout parses prompt/response pairs", () => {
  const chat = fixtureChat("gemini-takeout");
  assert.equal(chat.source, "gemini-takeout");
  assert.equal(chat.messages.length, 4);
  assert.equal(chat.messages[0].role, "user");
  assert.equal(chat.messages[1].role, "assistant");
  assert.ok(chat.messages[1].text.includes("SQLite"));
});

test("gemini console export parses conversation", () => {
  const chat = fixtureChat("gemini-console");
  assert.equal(chat.source, "gemini");
  assert.equal(chat.messages.length, 4);
  assert.ok(chat.messages[3].text.includes("Dockerfile"));
  assert.equal(chat.title, "Dockerize a FastAPI app");
});

test("transcript parser handles **Name:** headers", () => {
  const chat = parseInput(fixture("transcript.md"));
  assert.equal(chat.source, "transcript");
  const roles = chat.messages.map((m) => m.role);
  assert.deepEqual(roles, ["user", "assistant", "user", "assistant", "user"]);
  assert.ok(chat.messages[1].text.includes("Prisma"));
});

test("plain pasted text with no markers becomes one user message", () => {
  const plain = parseInput("this is just a wall of text without any markers at all");
  assert.equal(plain.messages[0].role, "user");
  assert.ok(plain.messages[0].text.includes("wall of text"));
});

test("unparseable JSON reports an error", () => {
  const res = parseInput([{ anything: true }]);
  assert.ok(res.error);
});

test("garbage JSON string reports an error", () => {
  const res = parseInput("{ not valid json");
  assert.ok(res.error);
});

test("JSON passed as string parses", () => {
  const raw = fixture("claude-export.json");
  const chat = parseInput(raw);
  assert.equal(chat.source, "claude");
});