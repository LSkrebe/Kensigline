/**
 * Best-effort sell-side consensus via Yahoo Finance quoteSummary (no extra API key).
 */

export type ConsensusEstimates = {
  /** Next fiscal year revenue growth % (YoY). */
  year1RevenueGrowthPct: number | null;
  /** Second forward year revenue growth % (YoY). */
  year2RevenueGrowthPct: number | null;
  /** Next fiscal year EPS (annual, per share). */
  year1Eps: number | null;
  /** Second forward year EPS (annual, per share). */
  year2Eps: number | null;
};

let lastYahooAt = 0;

async function yahooRateLimit() {
  const minMs = Math.max(150, Number(process.env.YAHOO_MIN_INTERVAL_MS ?? 500));
  const now = Date.now();
  const wait = lastYahooAt ? Math.max(0, minMs - (now - lastYahooAt)) : 0;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastYahooAt = Date.now();
}

function num(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function trendRow(trend: unknown[], period: string) {
  if (!Array.isArray(trend)) return null;
  return trend.find((t) => String((t as { period?: string })?.period ?? "") === period) ?? null;
}

function revenueGrowthFromTrend(row: unknown): number | null {
  const r = row as {
    growth?: { raw?: number };
    revenueEstimate?: { growth?: { raw?: number } };
  };
  const g = num(r?.revenueEstimate?.growth?.raw) ?? num(r?.growth?.raw);
  if (g == null) return null;
  // Yahoo sometimes returns decimal (0.12) or percent (12).
  const pct = Math.abs(g) <= 2 ? g * 100 : g;
  if (pct < -100 || pct > 500) return null;
  return Math.round(pct * 10) / 10;
}

function epsFromTrend(row: unknown): number | null {
  const r = row as { earningsEstimate?: { avg?: { raw?: number } } };
  const eps = num(r?.earningsEstimate?.avg?.raw);
  if (eps == null || eps <= 0) return null;
  return Math.round(eps * 100) / 100;
}

export async function fetchConsensusEstimates(ticker: string): Promise<ConsensusEstimates | null> {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) return null;

  await yahooRateLimit();
  const url =
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(t)}` +
    `?modules=earningsTrend`;

  try {
    const res = await fetch(url, { headers: { accept: "application/json,text/plain,*/*" } });
    const txt = await res.text().catch(() => "");
    if (!res.ok) return null;

    const json = JSON.parse(txt) as {
      quoteSummary?: { result?: Array<{ earningsTrend?: { trend?: unknown[] } }> };
    };
    const trend = json?.quoteSummary?.result?.[0]?.earningsTrend?.trend;
    if (!Array.isArray(trend) || !trend.length) return null;

    const y1 = trendRow(trend, "+1y");
    const y2 = trendRow(trend, "+2y") ?? trendRow(trend, "+3y");

    const out: ConsensusEstimates = {
      year1RevenueGrowthPct: revenueGrowthFromTrend(y1),
      year2RevenueGrowthPct: revenueGrowthFromTrend(y2),
      year1Eps: epsFromTrend(y1),
      year2Eps: epsFromTrend(y2),
    };

    const hasAny =
      out.year1RevenueGrowthPct != null ||
      out.year2RevenueGrowthPct != null ||
      out.year1Eps != null ||
      out.year2Eps != null;
    return hasAny ? out : null;
  } catch {
    return null;
  }
}
