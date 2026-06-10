/** Compact copy for Discover Market Moves cards. */
export function truncateDiscoverSummary(text: string | null | undefined, max = 200): string | null {
  const t = String(text ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!t) return null;
  if (t.length <= max) return t;
  const slice = t.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut}…`;
}
