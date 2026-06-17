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

/** Reject PTR worksheet blobs, IRA lines, and other non-issuer labels. */
export function isPlausibleCompanyDisplayName(name: string, ticker: string): boolean {
  const n = stripLegalNoise(String(name ?? "").trim());
  if (!n || isTickerPlaceholderName(n, ticker)) return false;
  if (n.length > 72) return false;
  if (/->|⇒|=>|→/.test(n)) return false;
  if (/\b(LOCATION|DESCRIPTION|Dividends|Real estate|Agency Account|Rent None)\b/i.test(n)) return false;
  if (/\bIRa\b/i.test(n)) return false;
  if (/g f e d c/i.test(n)) return false;
  if (/\[[A-Z]{1,5}\]/.test(n)) return false;
  if ((n.match(/\s+/g) ?? []).length >= 9) return false;
  if (/\$\d/.test(n)) return false;
  return true;
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
  if (!cleaned || !isPlausibleCompanyDisplayName(cleaned, ticker)) return null;
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

/** Research FEED + paper header: DB / SEC legal name only (never PTR asset blobs). */
export function resolveResearchFeedCompanyName(
  ticker: string,
  dbName: string | null | undefined,
  ...fallbacks: Array<string | null | undefined>
): string {
  const t = String(ticker ?? "").trim().toUpperCase();
  for (const raw of [dbName, ...fallbacks]) {
    const candidate = stripLegalNoise(String(raw ?? "").trim());
    if (candidate && isPlausibleCompanyDisplayName(candidate, t)) return candidate;
  }
  return t;
}

/** Investigate FEED: DB name, SEC title, issuer JSON — not raw PTR asset text. */
export function resolveInvestigateFeedCompanyName(
  ticker: string,
  dbName: string | null | undefined,
  secTitle: string | null | undefined,
  issuerJsonName: string | null | undefined,
): string {
  return resolveResearchFeedCompanyName(ticker, dbName, secTitle, issuerJsonName);
}
