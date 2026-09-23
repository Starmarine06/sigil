import { parseInput } from "./parse/detect.js";
import { sentences, stripCodeFences } from "./nlp/token.js";
import { textrank } from "./nlp/textrank.js";
import { mmr } from "./nlp/mmr.js";
import { rake } from "./nlp/rake.js";
import { segmentTopics } from "./nlp/topics.js";
import { extractGoal } from "./extract/goal.js";
import { extractRules } from "./extract/rules.js";
import { extractFiles } from "./extract/files.js";
import { extractCode } from "./extract/codeblocks.js";
import { extractCommands } from "./extract/commands.js";
import { extractTechStack } from "./extract/stack.js";
import { extractGlossary } from "./extract/glossary.js";
import { extractQuestions } from "./extract/questions.js";
import { extractStats } from "./extract/stats.js";
import { extractCurrentState } from "./extract/current-state.js";
import { compressTranscript } from "./compress/transcript.js";
import { renderContext } from "./render/context-md.js";

/**
 * One-shot pipeline: input (string or parsed JSON) -> full analysis.
 * Deterministic for identical input. Never calls the network.
 */
export function analyze(input, opts = {}) {
  const chat = parseInput(input, opts);
  if (chat.error) return { error: chat.error };
  if (opts.title && typeof opts.title === "string") chat.title = opts.title;

  const messages = chat.messages;

  // ── sentence-level index (code removed) for TextRank/MMR ──────────
  let global = 0;
  const sentIndex = [];
  for (const m of messages) {
    const stripped = stripCodeFences(m.text, " [code] ");
    for (const s of sentences(stripped)) {
      sentIndex.push({ text: s, turn: m.turn, role: m.role, global: global++ });
    }
  }
  const sentTexts = sentIndex.map((s) => s.text);

  // Typically we only sentence-rank assistant prose (to represent what the
  // assistant said), but for "representative sentences" we rank everyone's
  // sentences and then filter to assistant, so the transcript can also
  // surface the strongest user asks. Keep it simple and rank all.
  const { scores, links } = textrank(sentTexts);
  const picks = mmr(sentTexts, scores, { topN: opts.topSentences || 6 });

  // candidate assistant sentences for the "Representative sentences" section
  const repCandidates = sentIndex
    .map((s, i) => ({
      ...s,
      score: scores[i],
      links: links[i],
      luhn: 0, // placeholder; luhn not used for rep section
    }))
    .filter((s) => s.role === "assistant" && s.text.length >= 24 && s.text.length <= 400);

  const repPicks = (opts.topSentences || 6) > 0 ? mmr(repCandidates.map((s) => s.text), repCandidates.map((s) => s.score), { topN: opts.topSentences || 6 }) : [];

  // ── rule-based extractions ────────────────────────────────────────
  const rules = extractRules(messages);
  const goal = extractGoal(messages);
  const files = extractFiles(messages);
  const codeRaw = extractCode(messages);
  const commands = extractCommands(messages);
  const stack = extractTechStack(messages);
  const glossary = extractGlossary(messages);
  const questions = extractQuestions(messages);
  const stats = extractStats(messages);
  const currentState = extractCurrentState(messages);

  // ── explainable NLP extractions ───────────────────────────────────
  const wholeText = messages.map((m) => stripCodeFences(m.text)).join("\n");
  const keyPhrases = rake(wholeText, { topN: opts.topKeyphrases || 12 });
  const turnTexts = messages.map((m) => stripCodeFences(m.text));
  const topics = segmentTopics(turnTexts);

  // ── compressed transcript ─────────────────────────────────────────
  const transcript = compressTranscript(messages, { sentIndex, scores, picks, docs: codeRaw });

  const sections = {
    goal,
    rules,
    files,
    code: codeRaw,
    commands,
    stack,
    glossary,
    questions,
    stats,
    currentState,
    keyPhrases,
    topics,
    sentIndex,
    scores,
    links,
    representative: buildRepresentative(repCandidates, repPicks),
    transcript,
  };

  const markdown = renderContext({ chat, sections, opts });

  return {
    chat,
    sections,
    markdown,
    rendering: true,
  };
}

function buildRepresentative(candidates, picks) {
  return picks
    .map((p, rank) => {
      const c = candidates[p.index];
      if (!c) return null;
      return {
        text: c.text,
        turn: c.turn,
        score: Math.round(c.score * 1000) / 1000,
        links: c.links,
        mmrRank: rank + 1,
        mmr: p.mmr,
      };
    })
    .filter(Boolean);
}

export { parseInput } from "./parse/detect.js";
export { renderContext } from "./render/context-md.js";