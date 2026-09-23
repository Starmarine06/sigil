import test from "node:test";
import assert from "node:assert/strict";
import { extractCurrentState } from "../src/extract/current-state.js";

function msg(role, text, turn) {
  return { role, text, turn };
}

test("captures last ask and next steps from final assistant turns", () => {
  const messages = [
    msg("user", "please set up hyprland for me", 1),
    msg("assistant", "here is your hyprland.conf\n\nthen reload hyprland to apply the changes", 2),
    msg("user", "ok done", 3),
    msg("assistant", "make sure monitor is set to 144Hz and verify it works", 4),
  ];
  const st = extractCurrentState(messages);
  assert.equal(st.lastAsk.text, "ok done");
  assert.equal(st.lastAsk.turn, 3);
  assert.ok(st.nextSteps.length >= 2, "found next steps");
  assert.deepEqual(
    st.nextSteps.map((s) => s.rule),
    ["sequencing cue", "verification cue"]
  );
  assert.equal(st.nextSteps[0].turn, 2);
  assert.equal(st.nextSteps[1].turn, 4);
});

test("only considers the trailing assistant turns (tailTurns)", () => {
  const messages = [
    msg("assistant", "then reload hyprland", 1),
    msg("assistant", "then restart waybar", 2),
    msg("assistant", "then verify the clock", 3),
    msg("user", "thanks", 4),
    msg("assistant", "done", 5),
  ];
  const st = extractCurrentState(messages, { tailTurns: 2 });
  const texts = st.nextSteps.map((s) => s.text);
  assert.ok(!texts.some((t) => t.includes("reload hyprland")), "turn 1 excluded (outside tail)");
  assert.ok(!texts.some((t) => t.includes("restart waybar")), "turn 2 excluded (outside tail)");
  assert.ok(texts.some((t) => t.includes("verify the clock")), "turn 3 included");
});

test("ignores code fences even when they contain cue-like lines", () => {
  const messages = [
    msg("user", "show me", 1),
    msg(
      "assistant",
      "```\nthen run the install script\nmake sure you restart\n```\n\nthen reload the config",
      2
    ),
  ];
  const st = extractCurrentState(messages);
  assert.equal(st.nextSteps.length, 1);
  assert.match(st.nextSteps[0].text, /reload the config/);
  assert.doesNotMatch(st.nextSteps[0].text, /install script/);
});

test("caps and dedupes next steps", () => {
  const lines = Array.from({ length: 10 }, (_, i) => `then do step ${i} for the setup`);
  const messages = [
    msg("user", "go", 1),
    msg("assistant", lines.join("\n"), 2),
  ];
  const st = extractCurrentState(messages);
  assert.ok(st.nextSteps.length <= 6, "capped at 6");
  const texts = st.nextSteps.map((s) => s.text.toLowerCase());
  assert.equal(new Set(texts).size, texts.length, "no duplicates");
});

test("returns empty next steps when there is nothing actionable", () => {
  const messages = [
    msg("user", "hello", 1),
    msg("assistant", "hi, how can I help you today?", 2),
    msg("user", "nice, thanks", 3),
    msg("assistant", "you're welcome", 4),
  ];
  const st = extractCurrentState(messages);
  assert.ok(Array.isArray(st.nextSteps));
  assert.equal(st.nextSteps.length, 0);
  assert.equal(st.lastAsk.text, "nice, thanks");
});