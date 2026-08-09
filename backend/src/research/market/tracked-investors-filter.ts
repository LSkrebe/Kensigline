/** Placeholder / type-label filer names that collapse into bogus mega-rows. */
const PLACEHOLDER_INVESTOR_NAME_RE =
  /^(institutions?|insiders?|politicians?|filers?|unknown|n\/?a|null|undefined|none|—|-|–|--)$/i;

/** Single-ticker 13F / flow deltas above this are almost always bad units or parse errors. */
export const ABSURD_TRACKED_USD = 50_000_000_000;

export function isPlaceholderInvestorName(name: string | null | undefined): boolean {
  const s = String(name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return true;
  if (PLACEHOLDER_INVESTOR_NAME_RE.test(s)) return true;
  // e.g. "Institution #1", "Unknown filer"
  if (/^(institutions?|insiders?|politicians?|unknown)\b/i.test(s) && s.length <= 24) return true;
  return false;
}

export function isAbsurdTrackedUsd(usd: number | null | undefined): boolean {
  const n = Number(usd);
  return Number.isFinite(n) && Math.abs(n) > ABSURD_TRACKED_USD;
}

export function isPlausibleTrackedFiler(name: string | null | undefined, usd?: number | null): boolean {
  if (isPlaceholderInvestorName(name)) return false;
  if (usd != null && isAbsurdTrackedUsd(usd)) return false;
  return true;
}
