function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

/** Parse `TICKER — Company Name reported…` memo titles into a display name. */
export function companyNameFromMemoTitle(ticker: string, title: string): string | null {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) return null;
  const m = String(title ?? "")
    .trim()
    .match(new RegExp(`^${escapeRegex(t)}\\s*[—–-]\\s*(.+)$`, "i"));
  if (!m?.[1]) return null;

  let body = m[1].trim();

  const affirmed = body.match(/affirmed\s+(.+?)(?:\.|,|$)/i);
  if (affirmed?.[1]) {
    body = affirmed[1].trim();
  } else {
    const verbPatterns = [
      /^(.+?)(?:'s)?\s+reported\b/i,
      /^(.+?)(?:'s)?\s+announced\b/i,
      /^(.+?)\s+reports\b/i,
      /^(.+?)\s+exceeded\b/i,
      /^(.+?)\s+is offering\b/i,
      /^(.+?)\s+has amended\b/i,
      /^(.+?)\s+has\s+/i,
      /^(.+?)\s+have\s+/i,
      /^(.+?)(?:'s)\s+(?:Q\d|fiscal|FY)\b/i,
    ];
    for (const re of verbPatterns) {
      const hit = body.match(re);
      if (hit?.[1]) {
        body = hit[1].trim();
        break;
      }
    }
  }

  if (body.length > 72) {
    const short = body.split(/[,.]/)[0]?.trim();
    if (short && short.length >= 3 && short.length <= 72) body = short;
  }

  body = stripLegalNoise(body.replace(/'s$/i, "").trim());
  if (!body || body.toUpperCase() === t) return null;
  return body;
}

export function resolveResearchFeedCompanyName(
  ticker: string,
  dbName: string | null | undefined,
  memoTitle: string | null | undefined,
): string {
  const t = String(ticker ?? "").trim().toUpperCase();
  const fromDb = stripLegalNoise(String(dbName ?? "").trim());

  if (memoTitle) {
    const fromTitle = companyNameFromMemoTitle(t, memoTitle);
    if (fromTitle) return fromTitle;
  }

  if (fromDb && !isTickerPlaceholderName(fromDb, t)) return fromDb;
  return t;
}
