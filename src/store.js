import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Named-project registry so `sigil <name>` can re-open a session.
 * Store lives in ~/.sigil/projects.json (overridable via `dir` for tests).
 */
const DEFAULT_DIR = join(homedir(), ".sigil");

function filePath(dir) {
  return join(dir, "projects.json");
}

export function loadStore(dir = DEFAULT_DIR) {
  try {
    const store = JSON.parse(readFileSync(filePath(dir), "utf8"));
    if (store && store.projects && typeof store.projects === "object") return store;
  } catch {
    /* missing/corrupt store → fresh */
  }
  return { projects: {} };
}

export function saveStore(store, dir = DEFAULT_DIR) {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath(dir), JSON.stringify(store, null, 2) + "\n", "utf8");
  } catch {
    /* best-effort persistence */
  }
}

export function getProject(name, dir = DEFAULT_DIR) {
  return loadStore(dir).projects[name] || null;
}

export function setProject(name, data, dir = DEFAULT_DIR) {
  const store = loadStore(dir);
  const prev = store.projects[name] || {};
  store.projects[name] = {
    ...prev,
    ...data,
    name,
    updatedAt: new Date().toISOString(),
  };
  if (!store.projects[name].createdAt) store.projects[name].createdAt = store.projects[name].updatedAt;
  saveStore(store, dir);
  return store.projects[name];
}