import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRules } from "../src/extract/rules.js";
import { extractFiles } from "../src/extract/files.js";
import { extractCode } from "../src/extract/codeblocks.js";
import { extractCommands } from "../src/extract/commands.js";
import { extractTechStack } from "../src/extract/stack.js";
import { extractGlossary } from "../src/extract/glossary.js";
import { extractQuestions } from "../src/extract/questions.js";
import { extractGoal } from "../src/extract/goal.js";
import { stripCodeFences } from "../src/nlp/token.js";

function msg(role, text, turn) {
  return { role, text, turn };
}

test("goal comes from first substantive user message", () => {
  const g = extractGoal([msg("user", "hi", 0), msg("user", "I want to build an RSS reader in Node", 1)]).text;
  assert.ok(g.includes("RSS reader"));
});

test("decisions are extracted with evidence", () => {
  const msgs = [
    msg("user", "We should build it", 0),
    msg("assistant", "Let's go with SQLite for local storage and we'll use Prisma.", 1),
  ];
  const { decisions } = extractRules(msgs);
  assert.ok(decisions.length >= 1, JSON.stringify(decisions));
  const d = decisions[0];
  assert.ok(d.text.toLowerCase().includes("sqlite") || d.text.toLowerCase().includes("prisma"));
  assert.equal(typeof d.turn, "number");
  assert.ok(d.rule);
});

test("decision evidence uses a readable label, not the regex", () => {
  const msgs = [msg("assistant", "We'll use SQLite for local storage.", 0)];
  const { decisions } = extractRules(msgs);
  const d = decisions[0];
  assert.ok(d.rule);
  assert.ok(!/[\\/()[\]|+*{}?]/.test(d.rule), `rule still looks like a regex: ${d.rule}`);
  assert.ok(d.rule.split(" ").length >= 2, `not a phrase label: ${d.rule}`);
});

test("mid-paragraph decision is a clean sentence that ignores code fences", () => {
  const msgs = [
    msg(
      "assistant",
      "```bash\nyay -S quickshell-git\ncd quickshell-git\nnano PKGBUILD\n# whatever you prefer\n```\nWe decided to use eww for the sidebar widgets.",
      2,
    ),
  ];
  const { decisions } = extractRules(msgs);
  assert.ok(decisions.length >= 1, JSON.stringify(decisions));
  for (const d of decisions) {
    assert.ok(!d.text.includes("```"), `decision straddled a code fence: ${d.text}`);
    assert.ok(!/prefer/i.test(d.text), `cue inside code leaked: ${d.text}`);
    assert.ok(d.text.length < 200, `decision too long: ${d.text}`);
  }
  // the prose decision came through cleanly, without the code block context
  assert.ok(decisions.some((d) => /use eww/i.test(d.text)), JSON.stringify(decisions));
});

test("stripCodeFences backs the code-aware extracts", () => {
  const t = "x\n```py\nfor i in range(9): print(i)\n```\ny";
  assert.ok(!stripCodeFences(t).includes("range"));
});

test("user requirements are pulled from must/should lines", () => {
  const { requirements } = extractRules([
    msg("user", "The tool must store feed URLs. It should fetch every 15 minutes.", 0),
    msg("assistant", "ok", 1),
  ]);
  assert.ok(requirements.length >= 2, JSON.stringify(requirements));
});

test("actions from task lists and next-step phrasing", () => {
  const { actions } = extractRules([
    msg("assistant", "- [ ] add dedup check\n- [x] write schema\nNext step: wire node-cron.", 1),
  ]);
  const joined = actions.map((a) => a.text.toLowerCase()).join("\n");
  assert.ok(joined.includes("dedup"), JSON.stringify(actions));
  assert.ok(joined.includes("node-cron"), JSON.stringify(actions));
});

test("file paths extracted with extension filter", () => {
  const files = extractFiles([msg("assistant", "See prisma/schema.prisma and src/fetch.ts for the code.", 1)]);
  const paths = files.map((f) => f.path);
  assert.ok(paths.includes("prisma/schema.prisma"));
  assert.ok(paths.includes("src/fetch.ts"));
  assert.equal(files[0].count, 1);
});

test("code blocks dedupe identical, keep final version", () => {
  const msgs = [
    msg("assistant", "v1:\n```prisma\nmodel A { id Int }\n```", 1),
    msg("assistant", "v2:\n```prisma\nmodel A { id Int @id }\n```", 2),
  ];
  const blocks = extractCode(msgs);
  assert.equal(blocks.length, 2);
});

test("identical code appears once with count+final turn", () => {
  const msgs = [
    msg("assistant", "```js\nconst x = 1\n```", 1),
    msg("assistant", "tweak it again using same:\n```js\nconst x = 1\n```", 2),
  ];
  const blocks = extractCode(msgs);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].count, 2);
  assert.equal(blocks[0].turn, 2);
});

test("near-identical code (whitespace drift) collapses into one block", () => {
  const msgs = [
    msg("assistant", "```bash\nyay -S cpptrace --rebuild\n```", 1),
    msg("assistant", "again:\n```bash\nyay -S cpptrace  --rebuild\n```", 2),
  ];
  const blocks = extractCode(msgs);
  assert.equal(blocks.length, 1, JSON.stringify(blocks.map((b) => b.code)));
  assert.equal(blocks[0].count, 2);
  assert.equal(blocks[0].turn, 2);
});

test("commands start with $", () => {
  const cmds = extractCommands([msg("assistant", "Run:\n$ npm i prisma\n$ npx prisma migrate dev", 1)]);
  assert.ok(cmds.some((c) => c.cmd === "npm i prisma"));
  assert.ok(cmds.some((c) => c.cmd === "npx prisma migrate dev"));
});

test("tech stack recognizes keywords", () => {
  const stack = extractTechStack([msg("assistant", "We use Prisma with SQLite inside Node.js and Express.", 1)]);
  const terms = stack.map((s) => s.term.toLowerCase());
  assert.ok(terms.includes("prisma"));
  assert.ok(terms.includes("sqlite"));
  assert.ok(terms.some((t) => t.includes("node")));
});

test("glossary extracts definition statements", () => {
  const g = extractGlossary([msg("assistant", "RSS stands for Really Simple Syndication. Prisma is an ORM.", 1)]);
  const rss = g.find((x) => x.term === "RSS");
  assert.ok(rss);
  assert.ok(rss.def.toLowerCase().includes("really simple"));
});

test("open questions come from trailing questions", () => {
  const qs = extractQuestions([
    msg("user", "how do I schedule the fetch?", 0),
    msg("assistant", "use cron.schedule with a pattern.", 1),
    msg("user", "what about retries though?", 2),
    msg("assistant", "we can add a loop, it's a longer answer.", 3),
    msg("user", "ok but is retry worth it?", 4),
  ]);
  assert.ok(qs.length >= 1, JSON.stringify(qs));
  assert.ok(qs.every((q) => q.turn >= 0));
});