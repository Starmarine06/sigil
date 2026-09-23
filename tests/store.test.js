import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStore, getProject, setProject } from "../src/store.js";

let dir;
test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sigil-test-"));
});
test.afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("missing store returns empty project list", () => {
  const store = loadStore(dir);
  assert.deepEqual(store, { projects: {} });
});

test("setProject persists on disk and can be re-read", () => {
  setProject("hypr", { title: "Hyprland rice" }, dir);
  const store = loadStore(dir);
  assert.equal(store.projects.hypr.title, "Hyprland rice");
  const p = getProject("hypr", dir);
  assert.equal(p.name, "hypr");
  assert.ok(p.createdAt);
  assert.ok(p.updatedAt);
});

test("setProject merges with previous data and preserves createdAt", () => {
  setProject("hypr", { title: "Hyprland rice" }, dir);
  const created = getProject("hypr", dir).createdAt;
  setProject("hypr", { savedFile: "C:\\x\\out.md" }, dir);
  const p = getProject("hypr", dir);
  assert.equal(p.title, "Hyprland rice");
  assert.equal(p.savedFile, "C:\\x\\out.md");
  assert.equal(p.createdAt, created);
});

test("corrupt store file falls back to empty", () => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "projects.json"), "not json{{", "utf8");
  assert.deepEqual(loadStore(dir), { projects: {} });
});

test("projects.json exists after a save", () => {
  setProject("x", { title: "y" }, dir);
  assert.ok(existsSync(join(dir, "projects.json")));
  const parsed = JSON.parse(readFileSync(join(dir, "projects.json"), "utf8"));
  assert.equal(parsed.projects.x.title, "y");
});