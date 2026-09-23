/**
 * Open questions: user messages ending in "?" that are either the final
 * message or followed by an assistant reply too short to count as an answer.
 * Evidence explains which heuristic flagged it.
 */
export function extractQuestions(messages) {
  const out = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const text = m.text.trim();
    if (!/[?？]\s*$/.test(text)) continue;
    if (text.length > 400) continue; // big pasted blocks aren't questions

    const rest = messages.slice(i + 1);
    const nextAssistant = rest.find((x) => x.role === "assistant");
    const isLast = rest.length === 0;
    const answered = nextAssistant && nextAssistant.text.length >= 300;

    if (isLast) {
      out.push({
        text: text.slice(0, 200),
        turn: i,
        rule: "final message ends in a question",
      });
    } else if (!answered) {
      out.push({
        text: text.slice(0, 200),
        turn: i,
        rule: "ends in a question but the next assistant reply is short/no answer",
      });
    }
  }
  return out;
}