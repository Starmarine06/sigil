export async function fetchGemini({ url }) {
  return {
    title: "Custom Boho Adventure T-Shirt Design",
    text: [
      "**human:** Design a custom boho adventure T-shirt for me.",
      "**assistant:** Here is a concept: sun-soaked boho tee with a mountain silhouette, a semi-colon nod, and 'Adventure Awaits' lettering.",
    ].join("\n"),
  };
}