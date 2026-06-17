function stripLegalNoise(name: string) {
  return String(name ?? "")
    .trim()
    .replace(/\s+common\s+stock$/i, "")
    .replace(/\s+class\s+[a-z0-9]+$/i, "")
    .trim();
}

function isTickerPlaceholderName(name: string, ticker: string) {
  const n = stripLegalNoise(name).toUpperCase();
  const t = String(ticker ?? "").trim().toUpperCase();
  return !n || n === t;
}

/** Research FEED middle column: companies.name only (never memo headline text). */
export function resolveResearchFeedCompanyName(
  ticker: string,
  dbName: string | null | undefined,
  ...fallbacks: Array<string | null | undefined>
): string {
  const t = String(ticker ?? "").trim().toUpperCase();
  for (const raw of [dbName, ...fallbacks]) {
    const fromDb = stripLegalNoise(String(raw ?? "").trim());
    if (fromDb && !isTickerPlaceholderName(fromDb, t)) return fromDb;
  }
  return t;
}
