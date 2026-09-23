import { spawnSync } from "node:child_process";

/**
 * Copy text to the system clipboard using the platform's native tool.
 * Zero dependencies; no clipboard tool → returns false.
 */
export function copyText(text) {
  const os = process.platform;
  if (os === "win32") {
    const r = spawnSync("clip", [], { input: String(text) });
    return r.error ? false : true;
  }
  if (os === "darwin") {
    const r = spawnSync("pbcopy", [], { input: String(text) });
    return r.error ? false : true;
  }
  for (const [cmd, args] of [
    ["xsel", ["-b", "-i"]],
    ["xclip", ["-selection", "clipboard"]],
    ["wl-copy", []],
  ]) {
    const r = spawnSync(cmd, args, { input: String(text) });
    if (!r.error) return true;
  }
  return false;
}