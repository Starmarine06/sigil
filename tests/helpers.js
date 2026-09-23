import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseInput } from "../src/index.js";

export function fixture(name) {
  return readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
}

/** Parse a fixture JSON by name (e.g. "claude-export"). */
export function fixtureChat(name) {
  const raw = fixture(name + ".json");
  return parseInput(raw);
}

/** Build a synthetic chat for extractor tests without files. */
export function syntheticChat(messages) {
  // bare [{role, content}] list -> generic source
  return parseInput(messages);
}