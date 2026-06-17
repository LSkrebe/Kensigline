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

/** PTR / flow worksheet asset label → issuer display name when possible. */
export function issuerNameFromFlowAsset(asset: string | null | undefined, ticker: string): string | null {
  let s = String(asset ?? "").trim();
  if (!s) return null;
  s = s.replace(/\s*[\(\[][^\)\]]*[\)\]]\s*$/g, "").trim();
  s = s.replace(/\s*-\s*common stock.*$/i, "").trim();
  s = s.replace(/\s+common stock.*$/i, "").trim();
  s = s.replace(/\s+ordinary shares.*$/i, "").trim();
  s = s.replace(/\s+class\s+[a-z0-9]+.*$/i, "").trim();
  const cleaned = stripLegalNoise(s);
  if (!cleaned || isTickerPlaceholderName(cleaned, ticker)) return null;
  return cleaned;
}

export function collectAssetNamesFromClusterData(data: unknown, ticker: string): string[] {
  const rows = Array.isArray((data as { cluster?: { worksheet_rows?: unknown[] } } | null)?.cluster?.worksheet_rows)
    ? (data as { cluster: { worksheet_rows: unknown[] } }).cluster.worksheet_rows
    : [];
  const out: string[] = [];
  for (const raw of rows) {
    const r = raw as { asset_name?: string | null; description?: string | null };
    const fromAsset = issuerNameFromFlowAsset(r?.asset_name, ticker);
    if (fromAsset) out.push(fromAsset);
    const fromDesc = issuerNameFromFlowAsset(r?.description, ticker);
    if (fromDesc) out.push(fromDesc);
  }
  return out;
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

/** Investigate FEED: DB name, SEC title, PTR asset labels, issuer JSON. */
export function resolveInvestigateFeedCompanyName(
  ticker: string,
  dbName: string | null | undefined,
  secTitle: string | null | undefined,
  issuerJsonName: string | null | undefined,
  assetNames: string[] = [],
): string {
  return resolveResearchFeedCompanyName(ticker, dbName, secTitle, issuerJsonName, ...assetNames);
}
