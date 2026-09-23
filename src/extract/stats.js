/** Message-level statistics and heuristic token estimate. */
export function extractStats(messages) {
  const totalChars = messages.reduce((a, m) => a + m.text.length, 0);
  const userChars = messages.filter((m) => m.role === "user").reduce((a, m) => a + m.text.length, 0);
  const assistantChars = totalChars - userChars;
  const tokens = Math.max(1, Math.round(totalChars / 4));
  const userTokens = Math.max(0, Math.round(userChars / 4));
  const assistantTokens = Math.max(0, Math.round(assistantChars / 4));

  return {
    messageCount: messages.length,
    userCount: messages.filter((m) => m.role === "user").length,
    assistantCount: messages.filter((m) => m.role === "assistant").length,
    chars: totalChars,
    userChars,
    assistantChars,
    tokens,
    userTokens,
    assistantTokens,
  };
}