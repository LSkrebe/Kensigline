import { completedDay } from "./calendar.js";
import { allWatchlistSlugs } from "../explore/watchlist-catalog.js";

type Exposure = { kind: string; filer_id: string; ticker: string; first_day?: string };
export function averageInvestorReturns(exposures: Exposure[], returns: Map<string, number>) {
  const people = new Map<string, { kind: string; filerId: string; stocks: Map<string, number> }>();
  for (const e of exposures) {
    const value = returns.get(e.ticker);
    if (value == null || !Number.isFinite(value)) continue;
    const key = e.kind + ":" + e.filer_id;
    const person = people.get(key) ?? { kind: e.kind, filerId: e.filer_id, stocks: new Map() };
    person.stocks.set(e.ticker, value);
    people.set(key, person);
  }
  return ["insiders", "politicians", "institutions"].map((kind) => {
    const ranked = [...people.values()]
      .filter((p) => p.kind === kind)
      .map((p) => ({
        filerId: p.filerId,
        returnFraction: [...p.stocks.values()].reduce((a, b) => a + b, 0) / p.stocks.size,
        stocks: p.stocks.size,
      }))
      .sort((a, b) => b.returnFraction - a.returnFraction || a.filerId.localeCompare(b.filerId));
    const values = ranked.map((p) => p.returnFraction);
    return {
      kind,
      returnFraction: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      investors: values.length,
      leaders: ranked.slice(0, 1),
    };
  });
}
export function annualWindow(days: string[]) {
  const ordered = [...new Set(days)].sort();
  const end = ordered.at(-1);
  if (!end) throw Error("market_history_pending");
  const target = new Date(end + "T00:00:00Z");
  target.setUTCFullYear(target.getUTCFullYear() - 1);
  const start = ordered.find((day) => day >= target.toISOString().slice(0, 10));
  if (!start || new Date(start + "T00:00:00Z").getTime() - target.getTime() > 7 * 86400000)
    throw Error("annual_history_pending");
  return { start, end };
}
export function availableHistoryReturns(
  exposures: Exposure[],
  histories: Map<string, { day: string; close: number }[]>,
  start: string,
  end: string,
) {
  const values = new Map<string, number>();
  const eligible: Exposure[] = [];
  for (const e of exposures) {
    const bars = histories.get(e.ticker) ?? [];
    const baseline = [start, e.first_day ?? start].sort().at(-1)!;
    const first = bars.find((b) => b.day >= baseline && b.day <= end && b.close > 0);
    const last = bars.find((b) => b.day === end && b.close > 0);
    if (!first || !last || first.day >= last.day) continue;
    const key = e.kind + ":" + e.filer_id + ":" + e.ticker;
    values.set(key, last.close / first.close - 1);
    eligible.push({ ...e, ticker: key });
  }
  return averageInvestorReturns(eligible, values);
}
let cached: any = null,
  refreshed = 0,
  pending: Promise<any> | null = null;
async function build() {
  const { db } = await import("../core/db.js");
  const asOf = completedDay();
  const catalogSlugs = allWatchlistSlugs();
  const dates = await db.queryApi<{ day: string }>(
    `SELECT b->>'day' AS "day" FROM disclosure_price_history h CROSS JOIN LATERAL jsonb_array_elements(h.bars) b WHERE h.ticker='SPY' AND b->>'day'<=$1 ORDER BY "day" DESC LIMIT 380`,
    [asOf],
  );
  const { start, end } = annualWindow(dates.map((d) => d.day));
  const prices = await db.queryApi<{ ticker: string; bars: { day: string; close: number }[] }>(
    `SELECT h.ticker,
    jsonb_agg(b ORDER BY b->>'day') bars
    FROM disclosure_price_history h CROSS JOIN LATERAL jsonb_array_elements(h.bars) b
    WHERE h.basis='split_adjusted_close' AND b->>'day'>=$1 AND b->>'day'<=$2 GROUP BY h.ticker`,
    [start, end],
    30000,
  );
  const exposures = await db.queryApi<Exposure>(
    `WITH exposure AS (
    SELECT 'insiders' kind,t.filer_id,t.issuer_id,min(t.transaction_at)::date::text first_day FROM insider_transactions t
    WHERE t.transaction_code IN ('P','S') AND t.is_derivative=false AND t.transaction_at<$2::date+interval '1 day' AND t.transaction_at>=$1::date-interval '2 years' GROUP BY t.filer_id,t.issuer_id
    UNION ALL
    SELECT 'politicians',t.filer_id,t.issuer_id,min(t.transaction_at)::date::text FROM politician_transactions t
    WHERE t.asset_name LIKE '%[ST]%' AND t.transaction_type ~* '^(p|purchase|buy|s|sale|sell)( |$)' AND t.transaction_at<$2::date+interval '1 day' AND t.transaction_at>=$1::date-interval '2 years' GROUP BY t.filer_id,t.issuer_id
    UNION ALL
    SELECT 'institutions',t.filer_id,t.issuer_id,min(t.transaction_at)::date::text FROM institution_transactions t
    WHERE t.data_quality_version>=1 AND t.instrument_type='shares' AND t.transaction_at<$2::date+interval '1 day' AND t.transaction_at>=$1::date-interval '2 years' GROUP BY t.filer_id,t.issuer_id
  ) SELECT e.kind,e.filer_id,i.ticker,e.first_day
    FROM exposure e
    JOIN issuers i ON i.id=e.issuer_id
    JOIN filers f ON f.id=e.filer_id
    WHERE e.filer_id IS NOT NULL
      AND lower(f.slug) = ANY($3::text[])`,
    [start, end, catalogSlugs],
    30000,
  );
  const groups = availableHistoryReturns(
    exposures,
    new Map(prices.map((p) => [p.ticker, p.bars])),
    start,
    end,
  );
  const ids = groups.flatMap((g) => g.leaders.map((l) => l.filerId));
  const filers = ids.length
    ? await db.queryApi<{ id: string; display_name: string; slug: string }>(
        "SELECT id,display_name,slug FROM filers WHERE id=ANY($1::uuid[])",
        [ids],
      )
    : [];
  const identities = new Map(filers.map((f) => [f.id, f]));
  const namedGroups = groups.map((g) => ({
    ...g,
    leaders: g.leaders.flatMap((l) => {
      const f = identities.get(l.filerId);
      return f?.slug ? [{ ...l, name: f.display_name, slug: f.slug }] : [];
    }),
  }));
  return {
    ok: true,
    period: "1Y",
    start,
    end,
    groups: namedGroups,
    methodology:
      "Available history within the trailing calendar year for Mercerline curated investors only. Each security starts at the later of the window start, its first eligible transaction date and its first available close. Shorter histories are not annualized. Each investor equally weighted; each distinct priced disclosed stock equally weighted within that investor. Available disclosure archive through the end of the period. Split-adjusted price returns, no dividends. Disclosed-stock reference, not actual holdings or personal P&L. Unpriced securities excluded.",
  };
}
export async function getCohortPerformance() {
  if (cached && Date.now() - refreshed < 1800000) return cached;
  if (!pending)
    pending = build()
      .then((v) => {
        cached = v;
        refreshed = Date.now();
        return v;
      })
      .finally(() => {
        pending = null;
      });
  return pending;
}
