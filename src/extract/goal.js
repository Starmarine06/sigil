/**
 * Goal detection: the first substantive user message, stripped of
 * pleasantries, truncated to a readable size. Evidence = that turn.
 */
const SALUTATIONS = /^(hi|hi there|hey|hey there|hello|good (morning|afternoon|evening)|yo|hola|dear)[.!,\s]*$/i;

export function extractGoal(messages) {
  const user = messages.filter((m) => m.role === "user");
  const first =
    user.find((m) => {
      const t = m.text.trim();
      return t.length > 30 && !SALUTATIONS.test(t);
    }) || user[0];

  if (!first) return null;

  const flat = first.text.replace(/\s+/g, " ").trim();
  const head = flat.slice(0, 420);
  return {
    text: head.length < flat.length ? `${head} …` : head,
    evidence: [{ turn: first.turn, rule: "first substantive user message" }],
  };
}