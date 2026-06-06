/**
 * Parse forward-looking revenue growth % from research document analysis text.
 * Returns null when no credible guidance phrase is found.
 */
export function parseForwardRevenueGrowthFromText(text: string): number | null {
  const t = String(text ?? "").trim();
  if (t.length < 20) return null;

  const patterns = [
    /(?:full[- ]?year|fy|fiscal\s+year)?\s*(?:20\d{2})?\s*revenue(?:\s+growth)?\s*(?:of|at|around|approximately|~)?\s*(\d+(?:\.\d+)?)\s*%/i,
    /(?:expects?|expecting|guidance|forecast|projected?)\s*(?:[\w\s,$-]{0,80})\s*(?:revenue|sales)\s*(?:[\w\s,$-]{0,40})\s*(?:grow|growth|increase|up)\s*(?:by|of|to)?\s*(?:approximately|about|~)?\s*(\d+(?:\.\d+)?)\s*%/i,
    /(\d+(?:\.\d+)?)\s*%\s*(?:[\w\s-]{0,30})?(?:revenue|sales)\s*growth/i,
    /revenue\s*growth\s*(?:guidance|outlook|forecast)?\s*(?:of|at|:)?\s*(\d+(?:\.\d+)?)\s*%/i,
    /(?:revenue|sales)\s*(?:is\s+)?(?:expected|projected)\s*(?:to\s+)?(?:grow|increase)\s*(?:by|~)?\s*(\d+(?:\.\d+)?)\s*%/i,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= -100 && n <= 500) return Math.round(n * 10) / 10;
  }

  return null;
}
