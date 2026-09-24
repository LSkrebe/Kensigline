/**
 * PTR / Form 278-T dollar bands → low / high / midpoint.
 * Midpoint is the only numeric amount we store for sizing; the band string stays for display.
 */
export function parseUsdAmountRange(
  s: string | null | undefined,
): { low: number | null; high: number | null; mid: number | null; raw: string | null } {
  const raw = s != null ? String(s).trim() : null;
  if (!raw) return { low: null, high: null, mid: null, raw: null };
  const cleaned = raw.replace(/\s+/g, " ").trim();

  // $1,001 - $15,000 | $1001–$15000 | $1,001 to $15,000
  const band = cleaned.match(
    /\$?\s*([\d,]+(?:\.\d+)?)\s*(?:[-–—]|to)\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
  );
  if (band) {
    const low = Number(String(band[1]).replace(/,/g, ""));
    const high = Number(String(band[2]).replace(/,/g, ""));
    const lo = Number.isFinite(low) ? low : null;
    const hi = Number.isFinite(high) ? high : null;
    if (lo != null && hi != null) {
      const a = Math.min(lo, hi);
      const b = Math.max(lo, hi);
      return { low: a, high: b, mid: (a + b) / 2, raw: cleaned };
    }
  }

  // Over $1,000,000 / Above $50,000 → treat as mid = stated floor (best available)
  const over = cleaned.match(/(?:over|above|more than|greater than)\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (over) {
    const n = Number(String(over[1]).replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return { low: n, high: null, mid: n, raw: cleaned };
  }

  // Under $1,001 / Less than $15,000 → mid = half of ceiling
  const under = cleaned.match(/(?:under|below|less than|up to)\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (under) {
    const n = Number(String(under[1]).replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return { low: 0, high: n, mid: n / 2, raw: cleaned };
  }

  // Single $amount
  const single = cleaned.match(/^\$?\s*([\d,]+(?:\.\d+)?)\s*$/);
  if (single) {
    const n = Number(String(single[1]).replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 0) return { low: n, high: n, mid: n, raw: cleaned };
  }

  return { low: null, high: null, mid: null, raw: cleaned };
}
