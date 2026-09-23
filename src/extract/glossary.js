/** "X is/means/stands for/refers to …" definition extraction from assistant text. */
const DEF_RE = new RegExp(
  "\\b([A-Z][A-Za-z0-9_+.#-]{1,31})\\s+(?:is|means|stands\\s+for|refers\\s+to|short\\s+for)\\s+([^\\n.!?]{4,140})",
  "gi"
);

export function extractGlossary(messages) {
  const terms = new Map();
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const re = new RegExp(DEF_RE.source, "gi");
    let m;
    while ((m = re.exec(msg.text))) {
      const term = m[1].trim();
      let def = m[2].trim();
      def = def.replace(/\s+[.;,]+$/, "").trim();
      if (!term || !def || terms.has(term.toLowerCase())) continue;
      terms.set(term.toLowerCase(), { term, def, turn: msg.turn });
    }
  }
  return [...terms.values()].sort((a, b) => a.turn - b.turn);
}