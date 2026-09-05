/** Minimum quarterly revenue before margin % is shown (avoids -900% on pre-revenue biotech). */
export const MIN_MARGIN_REVENUE_USD = 5_000_000;

const MAX_ABS_MARGIN_PCT = 300;

export function marginPctIfMeaningful(
  numeratorUsd: number | null,
  revenueUsd: number | null,
): number | null {
  if (numeratorUsd == null || revenueUsd == null || revenueUsd === 0) return null;
  if (Math.abs(revenueUsd) < MIN_MARGIN_REVENUE_USD) return null;
  const pct = Math.round((numeratorUsd / revenueUsd) * 1000) / 10;
  if (Math.abs(pct) > MAX_ABS_MARGIN_PCT) return null;
  return pct;
}
