import { completedDay } from "./calendar.js";
import {
  allWatchlistSlugs,
  catalogIdForFiler,
  EXPLORE_WATCHLIST_CATALOG,
  normalizeTrackedName,
} from "../explore/watchlist-catalog.js";
import { ensureExploreHomeSnapshotTable } from "../explore/home-snapshot.js";
import { db } from "../core/db.js";

type Exposure = { kind: string; filer_id: string; ticker: string; first_day?: string };

const COHORT_SNAPSHOT_KEY = "cohort_multi_v2";

const EXPLORE_RETURN_RANGES = ["1M", "3M", "6M", "1Y", "YTD"] as const;
type ExploreReturnRange = (typeof EXPLORE_RETURN_RANGES)[number];

function catalogNameKeys(): string[] {
  const keys = new Set<string>();
  for (const entry of EXPLORE_WATCHLIST_CATALOG) {
    keys.add(normalizeTrackedName(entry.name));
    for (const n of entry.matchNames) keys.add(normalizeTrackedName(n));
  }
  return [...keys].filter(Boolean);
}

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
      leaders: ranked.slice(0, 3),
      members: ranked,
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

/** Calendar trailing windows aligned to available market days (same end as 1Y). */
export function exploreReturnWindow(days: string[], range: ExploreReturnRange) {
  const ordered = [...new Set(days)].sort();
  const end = ordered.at(-1);
  if (!end) throw Error("market_history_pending");
  if (range === "1Y") return annualWindow(ordered);
  if (range === "YTD") {
    const yearStart = `${end.slice(0, 4)}-01-01`;
    const start = ordered.find((day) => day >= yearStart) ?? ordered[0]!;
    return { start, end };
  }
  const months = range === "1M" ? 1 : range === "3M" ? 3 : 6;
  const target = new Date(end + "T00:00:00Z");
  target.setUTCMonth(target.getUTCMonth() - months);
  const want = target.toISOString().slice(0, 10);
  const start = ordered.find((day) => day >= want) ?? ordered[0]!;
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
    // Use the last available session on/before the window end — bars may lag SPY's calendar.
    let last: { day: string; close: number } | undefined;
    for (let i = bars.length - 1; i >= 0; i--) {
      const bar = bars[i]!;
      if (bar.day > end || !(bar.close > 0)) continue;
      last = bar;
      break;
    }
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

export function invalidateCohortCache() {
  cached = null;
  refreshed = 0;
}

async function readCohortSnapshot() {
  await ensureExploreHomeSnapshotTable();
  const row = await db.oneApi<{ payload: any; updated_at: string }>(
    `SELECT payload, updated_at::text FROM explore_home_snapshot WHERE cache_key = $1 LIMIT 1`,
    [COHORT_SNAPSHOT_KEY],
    8_000,
  );
  if (!row?.payload || typeof row.payload !== "object") return null;
  return row.payload;
}

async function writeCohortSnapshot(payload: unknown) {
  await ensureExploreHomeSnapshotTable();
  await db.queryApi(
    `
    INSERT INTO explore_home_snapshot (cache_key, payload, updated_at)
    VALUES ($1, $2::jsonb, now())
    ON CONFLICT (cache_key) DO UPDATE
      SET payload = EXCLUDED.payload, updated_at = now()
    `,
    [COHORT_SNAPSHOT_KEY, JSON.stringify(payload)],
    15_000,
  );
}

async function build() {
  const asOf = completedDay();
  const catalogSlugs = allWatchlistSlugs();
  const catalogNames = catalogNameKeys();
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
      AND (
        lower(f.slug) = ANY($3::text[])
        OR lower(trim(regexp_replace(
              regexp_replace(coalesce(f.display_name, ''), '^(the[[:space:]]+)?(honorable|hon\\.?|mr\\.?|mrs\\.?|ms\\.?)[[:space:]]+', '', 'i'),
              '[^a-zA-Z0-9]+', ' ', 'g'))) = ANY($4::text[])
        OR lower(regexp_replace(
              regexp_replace(coalesce(f.display_name, ''), '^(the[[:space:]]+)?(honorable|hon\\.?|mr\\.?|mrs\\.?|ms\\.?)[[:space:]]+', '', 'i'),
              '[^a-zA-Z0-9]+', '', 'g')) = ANY(
          SELECT replace(n, ' ', '') FROM unnest($4::text[]) AS n
        )
      )`,
    [start, end, catalogSlugs, catalogNames],
    30000,
  );
  const dayList = dates.map((d) => d.day);
  const histories = new Map(prices.map((p) => [p.ticker, p.bars]));
  const byFiler = new Map<
    string,
    { kind: string; filerId: string; stocks: number; returns: Partial<Record<ExploreReturnRange, number>> }
  >();
  let groups1y = availableHistoryReturns(exposures, histories, start, end);

  for (const range of EXPLORE_RETURN_RANGES) {
    const win = exploreReturnWindow(dayList, range);
    const groups =
      range === "1Y" ? groups1y : availableHistoryReturns(exposures, histories, win.start, win.end);
    if (range === "1Y") groups1y = groups;
    for (const g of groups) {
      for (const m of g.members ?? g.leaders) {
        const prev = byFiler.get(m.filerId);
        byFiler.set(m.filerId, {
          kind: g.kind,
          filerId: m.filerId,
          stocks: Math.max(prev?.stocks ?? 0, m.stocks),
          returns: { ...(prev?.returns ?? {}), [range]: m.returnFraction },
        });
      }
    }
  }

  const ids = [...byFiler.keys()];
  const filers = ids.length
    ? await db.queryApi<{ id: string; display_name: string; slug: string }>(
        "SELECT id,display_name,slug FROM filers WHERE id=ANY($1::uuid[])",
        [ids],
      )
    : [];
  const identities = new Map(filers.map((f) => [f.id, f]));

  // Disclosed capital put to work in-window (range midpoints / Form 4 / 13F notionals). Not AUM.
  const investedRows = await db.queryApi<{ filer_id: string; invested_usd: number }>(
    `
    WITH catalog AS (
      SELECT id FROM filers f
      WHERE lower(f.slug) = ANY($3::text[])
         OR lower(trim(regexp_replace(
              regexp_replace(coalesce(f.display_name, ''), '^(the[[:space:]]+)?(honorable|hon\\.?|mr\\.?|mrs\\.?|ms\\.?)[[:space:]]+', '', 'i'),
              '[^a-zA-Z0-9]+', ' ', 'g'))) = ANY($4::text[])
    ),
    sums AS (
      SELECT t.filer_id, sum(coalesce(t.amount_usd_mid, t.amount_usd, 0))::float8 AS invested_usd
      FROM politician_transactions t
      WHERE t.filer_id IN (SELECT id FROM catalog)
        AND t.transaction_at >= $1::date
        AND t.transaction_at < $2::date + interval '1 day'
        AND coalesce(t.amount_usd_mid, t.amount_usd, 0) > 0
      GROUP BY t.filer_id
      UNION ALL
      SELECT t.filer_id, sum(abs(coalesce(t.amount_usd, 0)))::float8
      FROM insider_transactions t
      WHERE t.filer_id IN (SELECT id FROM catalog)
        AND t.transaction_at >= $1::date
        AND t.transaction_at < $2::date + interval '1 day'
        AND coalesce(t.amount_usd, 0) <> 0
      GROUP BY t.filer_id
      UNION ALL
      SELECT t.filer_id, sum(abs(coalesce(t.amount_usd, 0)))::float8
      FROM institution_transactions t
      WHERE t.filer_id IN (SELECT id FROM catalog)
        AND t.transaction_at >= $1::date
        AND t.transaction_at < $2::date + interval '1 day'
        AND t.data_quality_version >= 1
        AND coalesce(t.amount_usd, 0) <> 0
      GROUP BY t.filer_id
    )
    SELECT filer_id, sum(invested_usd)::float8 AS invested_usd
    FROM sums
    GROUP BY filer_id
    HAVING sum(invested_usd) > 0
    `,
    [start, end, catalogSlugs, catalogNames],
    30_000,
  );
  const investedByFiler = new Map(investedRows.map((r) => [r.filer_id, Number(r.invested_usd)]));

  // Include invested-only filers so Most Popular can rank beyond return coverage.
  const extraInvestedIds = investedRows.map((r) => r.filer_id).filter((id) => !identities.has(id));
  if (extraInvestedIds.length) {
    const extra = await db.queryApi<{ id: string; display_name: string; slug: string }>(
      "SELECT id,display_name,slug FROM filers WHERE id=ANY($1::uuid[])",
      [extraInvestedIds],
    );
    for (const f of extra) identities.set(f.id, f);
  }

  const memberIds = new Set([...byFiler.keys(), ...investedByFiler.keys()]);
  const rawMembers = [...memberIds].flatMap((filerId) => {
    const f = identities.get(filerId);
    if (!f) return [];
    const slug = catalogIdForFiler(f.slug, f.display_name) ?? f.slug;
    if (!slug) return [];
    const perf = byFiler.get(filerId);
    const investedUsd = investedByFiler.get(filerId);
    const returnFraction = perf
      ? (perf.returns["1Y"] ?? perf.returns["6M"] ?? perf.returns["3M"] ?? null)
      : null;
    let kind = perf?.kind ?? null;
    if (!kind) {
      const entry = EXPLORE_WATCHLIST_CATALOG.find((e) => e.id === slug);
      kind =
        entry?.mode === "politicians"
          ? "politicians"
          : entry?.mode === "insiders"
            ? "insiders"
            : "institutions";
    }
    return [
      {
        kind,
        filerId,
        name: f.display_name,
        slug,
        stocks: perf?.stocks ?? 0,
        returnFraction,
        returns: perf?.returns ?? {},
        investedUsd: Number.isFinite(investedUsd) ? investedUsd : null,
      },
    ];
  });
  // One Explore row per catalog id — keep the stronger return / invested totals.
  const bySlug = new Map<string, (typeof rawMembers)[number]>();
  for (const m of rawMembers) {
    const prev = bySlug.get(m.slug);
    if (!prev) {
      bySlug.set(m.slug, m);
      continue;
    }
    bySlug.set(m.slug, {
      ...prev,
      stocks: Math.max(prev.stocks, m.stocks),
      returnFraction:
        (m.returnFraction ?? Number.NEGATIVE_INFINITY) > (prev.returnFraction ?? Number.NEGATIVE_INFINITY)
          ? m.returnFraction
          : prev.returnFraction,
      returns: { ...prev.returns, ...m.returns },
      investedUsd: Math.max(prev.investedUsd ?? 0, m.investedUsd ?? 0) || null,
    });
  }
  const members = [...bySlug.values()].sort(
    (a, b) =>
      (b.returnFraction ?? Number.NEGATIVE_INFINITY) - (a.returnFraction ?? Number.NEGATIVE_INFINITY) ||
      a.slug.localeCompare(b.slug),
  );
  const namedGroups = groups1y.map((g) => ({
    kind: g.kind,
    returnFraction: g.returnFraction,
    investors: g.investors,
    leaders: g.leaders.flatMap((l) => {
      const f = identities.get(l.filerId);
      const full = byFiler.get(l.filerId);
      if (!f) return [];
      const slug = catalogIdForFiler(f.slug, f.display_name) ?? f.slug;
      return slug
        ? [
            {
              ...l,
              name: f.display_name,
              slug,
              returns: full?.returns ?? { "1Y": l.returnFraction },
            },
          ]
        : [];
    }),
  }));
  return {
    ok: true,
    period: "1Y",
    start,
    end,
    asOf,
    groups: namedGroups,
    members,
    methodology:
      "Available history within each Explore range for Mercerline curated investors only. Each security starts at the later of the window start, its first eligible transaction date and its first available close. Shorter histories are not annualized. Each investor equally weighted; each distinct priced disclosed stock equally weighted within that investor. Available disclosure archive through the end of the period. Split-adjusted price returns, no dividends. Disclosed-stock reference, not actual holdings or personal P&L. Unpriced securities excluded. PTR sizing uses range midpoints where disclosed.",
  };
}

/** Rebuild + persist cohort snapshot (call after daily market refresh). */
export async function refreshCohortPerformanceSnapshot() {
  const payload = await build();
  cached = payload;
  refreshed = Date.now();
  try {
    await writeCohortSnapshot(payload);
  } catch (err) {
    console.warn("[cohort] snapshot_write_failed", err instanceof Error ? err.message : err);
  }
  return payload;
}

export async function getCohortPerformance() {
  if (cached && Date.now() - refreshed < 1800000) return cached;
  if (!pending) {
    pending = (async () => {
      try {
        const snap = await readCohortSnapshot();
        if (snap?.ok && snap?.end) {
          cached = snap;
          refreshed = Date.now();
          return snap;
        }
      } catch (err) {
        console.warn("[cohort] snapshot_read_failed", err instanceof Error ? err.message : err);
      }
      const payload = await build();
      cached = payload;
      refreshed = Date.now();
      void writeCohortSnapshot(payload).catch(() => undefined);
      return payload;
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}
