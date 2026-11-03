/** The non-empty trimmed lines of a text, each kept once in order of first appearance. */
export function lines(text: string): string[] {
  const trimmed = text.split("\n").map((l) => l.trim());
  return [...new Set(trimmed.filter((l) => l !== ""))];
}
