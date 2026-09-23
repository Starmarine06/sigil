import { test } from "node:test";
import assert from "node:assert/strict";
import { textrank } from "../src/nlp/textrank.js";
import { rake } from "../src/nlp/rake.js";
import { mmr } from "../src/nlp/mmr.js";
import { luhn } from "../src/nlp/luhn.js";
import { segmentTopics } from "../src/nlp/topics.js";
import { sentences, significantTokens } from "../src/nlp/token.js";
import { stripCodeFences } from "../src/nlp/token.js";

test("textrank puts the most-central sentence first", () => {
  const sents = [
    "The dog chased the ball across the field.",
    "The dog caught the ball and ran back home.",
    "Red pandas eat bamboo.",
    "Trees grow in the forest.",
  ];
  const { scores } = textrank(sents);
  const top = scores.indexOf(Math.max(...scores));
  assert.ok(top === 0 || top === 1, `expected a dog sentence, got #${top}`);
  assert.ok(scores.every((s) => Number.isFinite(s) && s >= 0));
});

test("textrank is deterministic for identical input", () => {
  const sents = ["one two three four", "two three four five", "six seven eight nine"];
  const a = textrank(sents);
  const b = textrank(sents);
  assert.deepEqual(a, b);
});

test("rake finds the repeated keyphrase", () => {
  const text =
    "prisma schema is great, the prisma schema defines tables, and the prisma schema migrations are simple.";
  const kp = rake(text, { topN: 5 });
  assert.ok(kp.some((k) => k.phrase.includes("prisma schema")), JSON.stringify(kp));
  assert.ok(kp.every((k) => typeof k.score === "number" && k.score > 0));
});

test("mmr picks the top by relevance then diversifies", () => {
  const sents = [
    "cats sleep a lot",
    "cats also eat fish",
    "gardens need water and soil",
    "soil quality matters for gardens",
  ];
  const { scores } = textrank(sents);
  const picks = mmr(sents, scores, { topN: 4 });
  assert.equal(picks.length, 4);
  assert.equal(new Set(picks.map((p) => p.index)).size, 4, "no duplicate sentences");
});

test("luhn scores shared-topic sentences higher", () => {
  const texts = [
    "run the database migration daily",
    "always run the database migration at night",
    "bananas are yellow fruits",
  ];
  const sc = luhn(texts);
  assert.ok(sc[0] > sc[2] && sc[1] > sc[2], JSON.stringify(sc));
});

test("segmentTopics splits two cohesive topics apart", () => {
  const items = [
    "install prisma and run migrate",
    "prisma migrate creates the sqlite tables",
    "prisma studio opens the database gui",
    "celebrate the birthday with cake",
    "cake recipes need eggs and flour",
  ];
  const segs = segmentTopics(items);
  assert.ok(segs.length >= 2, JSON.stringify(segs));
});

test("sentences splits prose and skips empties", () => {
  const s = sentences("First sentence. Second one!\nThird line"); 
  assert.ok(s.some((x) => x.includes("First")));
  assert.ok(s.some((x) => x.includes("Second")));
  assert.ok(s.some((x) => x.includes("Third")));
});

test("significantTokens removes stopwords", () => {
  const toks = significantTokens("the quick brown fox as a test");
  assert.ok(!toks.includes("the"));
  assert.ok(!toks.includes("as"));
  assert.ok(toks.includes("quick"));
});

test("rake caps phrases so code runs can't become topics", () => {
  const blob =
    "defwidget sysmonitor box class sys-box orientation space-evenly false label class sys-title " +
    "label class sys-row orientation label text cpu label class sys-val text cpu box class".repeat(6);
  const kp = rake(blob, { topN: 5 });
  assert.ok(kp.length > 0, JSON.stringify(kp));
  assert.ok(kp.every((k) => k.phrase.split(" ").length <= 12), JSON.stringify(kp));
});

test("stripCodeFences removes fenced and unterminated code", () => {
  const fenced = "Let's look.\n```js\nconst x = 'a b c d e f g h i j k l';\n```\nThen we build.";
  assert.ok(stripCodeFences(fenced).includes("Let's look"));
  assert.ok(stripCodeFences(fenced).includes("Then we build"));
  assert.ok(!stripCodeFences(fenced).includes("const x"));

  const unterminated = "Intro\n```js\nconst y = 1;\n// never closed";
  const stripped = stripCodeFences(unterminated);
  assert.ok(!stripped.includes("const y"), stripped);
  assert.ok(stripped.includes("Intro"));
});