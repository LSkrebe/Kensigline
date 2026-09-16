/** Deterministic, equal-weight event study. These are stock outcomes, never personal P&L. */
export type PriceBar = { day: string; close: number };
export type OutcomeEvent = {
  id: string;
  ticker: string;
  category: string;
  action: string;
  instrument: string;
  reportedAt: string | null;
  observedAt: string;
  sourceUrl: string | null;
  [key: string]: unknown;
};
const day = (v: string) => v.slice(0, 10);
const addDays = (v: string, n: number) =>
  new Date(Date.parse(day(v) + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
function lastAt(bars: PriceBar[], date: string): PriceBar {
  let lo = 0,
    hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (bars[mid]!.day <= date) lo = mid + 1;
    else hi = mid;
  }
  return bars[lo - 1]!;
}
const usable = (bars: PriceBar[]) =>
  bars
    .filter(
      (b) =>
        /^\d{4}-\d{2}-\d{2}$/.test(b.day) &&
        Number.isFinite(b.close) &&
        b.close > 0,
    )
    .sort((a, b) => a.day.localeCompare(b.day));
export function analyzeOutcomes(
  events: OutcomeEvent[],
  histories: Map<string, PriceBar[]>,
  options: { clock: "reported" | "observed"; horizon: number; action: string },
) {
  const horizon = [30, 90, 180].includes(options.horizon)
    ? options.horizon
    : 90;
  const spy = usable(histories.get("SPY") ?? []);
  const prices = new Map([...histories].map(([t, b]) => [t, usable(b)]));
  const counts = {
    total: events.length,
    eligible: 0,
    measured: 0,
    missingPrices: 0,
    notMature: 0,
    unsupported: 0,
    duplicates: 0,
  };
  const observations: any[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (e.action !== options.action) continue;
    const anchor = options.clock === "reported" ? e.reportedAt : e.observedAt;
    if (e.instrument !== "shares" || !anchor || !e.sourceUrl) {
      counts.unsupported++;
      continue;
    }
    const key = `${e.ticker}:${day(anchor)}:${e.action}`;
    if (seen.has(key)) {
      counts.duplicates++;
      continue;
    }
    seen.add(key);
    counts.eligible++;
    const bars = prices.get(e.ticker) ?? [];
    const earliest = addDays(anchor, 1);
    if (spy.length && earliest > spy.at(-1)!.day) {
      counts.notMature++;
      continue;
    }
    const entry = bars.find((b) => b.day >= earliest);
    if (!entry || entry.day > addDays(earliest, 7)) {
      counts.missingPrices++;
      continue;
    }
    const target = addDays(entry.day, horizon);
    const exit = bars.find((b) => b.day >= target);
    if (!exit) {
      if (target <= (spy.at(-1)?.day ?? bars.at(-1)?.day ?? ""))
        counts.missingPrices++;
      else counts.notMature++;
      continue;
    }
    const marketEntry = spy.find((b) => b.day === entry.day),
      marketExit = spy.find((b) => b.day === exit.day);
    if (exit.day > addDays(target, 7) || !marketEntry || !marketExit) {
      counts.missingPrices++;
      continue;
    }
    const stockReturn = (exit.close / entry.close - 1) * 100,
      marketReturn = (marketExit.close / marketEntry.close - 1) * 100;
    observations.push({
      ...e,
      entryDate: entry.day,
      exitDate: exit.day,
      entryPrice: entry.close,
      exitPrice: exit.close,
      stockReturn,
      marketReturn,
      excessReturn: stockReturn - marketReturn,
    });
  }
  counts.measured = observations.length;
  const mean = (k: string) =>
    observations.length
      ? observations.reduce((s, e) => s + e[k], 0) / observations.length
      : null;
  // Same completed cohort at every chart point: changing sample composition cannot create a false trend.
  const curve = Array.from({ length: horizon + 1 }, (_, n) => {
    if (!observations.length) return { day: n, stock: null, market: null };
    let stock = 0,
      market = 0;
    for (const e of observations) {
      const date = n === horizon ? e.exitDate : addDays(e.entryDate, n);
      const b = lastAt(prices.get(e.ticker)!, date);
      const m = lastAt(spy, date);
      stock += (b.close / e.entryPrice) * 100;
      market += (m.close / spy.find((b) => b.day === e.entryDate)!.close) * 100;
    }
    return {
      day: n,
      stock: stock / observations.length,
      market: market / observations.length,
    };
  });
  return {
    clock: options.clock,
    horizon,
    action: options.action,
    counts,
    stockReturn: mean("stockReturn"),
    marketReturn: mean("marketReturn"),
    excessReturn: mean("excessReturn"),
    positiveRate: observations.length
      ? (observations.filter((e) => e.stockReturn > 0).length /
          observations.length) *
        100
      : null,
    observations,
    curve,
    methodology:
      "Equal weight per ticker and anchor date. Entry is the first available closing price strictly after the selected date; exit is the first close at or after the horizon. Both closes must have SPY prices. Split-adjusted stock prices; dividends, fees and taxes excluded. Sales are measured as subsequent stock moves, not short trades. This is an event study, not the filer’s portfolio return or profit.",
  };
}
