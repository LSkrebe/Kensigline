import {
  companyDocType,
  exploreQueryApi,
  formatInstitutionTrail,
  formatTrailPct,
  formatTrailUsd,
  formatTrailUsdRange,
  insiderDocType,
  insiderSide,
  institutionDocType,
  institutionSide,
  pctMoveFromCloses,
  politicianDocType,
  politicianSide,
  recapDocLabel,
  todayUtcIso,
  tryExploreBars,
  tryExploreQuery,
} from "./helpers.js";
import { getSecTickerTitleMap } from "../core/sec.js";
import { formatCompanyDisplayName } from "../research/feed-display.js";
import { isPlausibleTrackedFiler } from "../research/market/tracked-investors-filter.js";

type RecapFiling = Record<string, unknown>;

function earningsDateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function earningsProximityLabel(daysAhead: number): string | null {
  if (!Number.isFinite(daysAhead) || daysAhead < 0) return null;
  if (daysAhead === 0) return "Today";
  if (daysAhead === 1) return "1d";
  return `${daysAhead}d`;
}

export async function buildExploreRecapDayPayload(opts?: { lookbackDays?: number }) {
  const lookback = Math.max(1, Math.min(14, opts?.lookbackDays ?? 7));
  const dayKey = todayUtcIso();

  // Sequential checkouts — recap runs after directory; keep one connection per step under a 4-slot pool.
  const [insiders, politicians, earningsRows] = await Promise.all([
    tryExploreQuery("recap.insiders", () => exploreQueryApi<{
      id: string;
      filing_date: string;
      ticker: string;
      company_name: string;
      actor_id: string;
      actor_name: string;
      actor_role: string | null;
      code: string | null;
      acquired_disposed: string | null;
      amount_usd: number | null;
      headline: string | null;
    }>(
      `
      SELECT
        t.id::text,
        t.transaction_at::date::text AS filing_date,
        upper(trim(i.ticker)) AS ticker,
        coalesce(nullif(trim(i.name), ''), upper(trim(i.ticker))) AS company_name,
        f.slug AS actor_id,
        f.display_name AS actor_name,
        t.role AS actor_role,
        t.transaction_code AS code,
        t.acquired_disposed,
        t.amount_usd::float8 AS amount_usd,
        NULL::text AS headline
      FROM insider_transactions t
      JOIN filers f ON f.id = t.filer_id
      JOIN issuers i ON i.id = t.issuer_id
      WHERE i.ticker IS NOT NULL
        AND length(trim(i.ticker)) BETWEEN 1 AND 6
        AND t.transaction_at >= (now() AT TIME ZONE 'UTC')::date - ($1::int || ' days')::interval
        AND t.transaction_at::date <= (now() AT TIME ZONE 'UTC')::date
      ORDER BY t.transaction_at DESC
      LIMIT 120
      `,
      [lookback],
    )),

    tryExploreQuery("recap.politicians", () => exploreQueryApi<{
      id: string;
      filing_date: string;
      ticker: string;
      company_name: string;
      actor_id: string;
      actor_name: string;
      transaction_type: string | null;
      amount_usd: number | null;
      headline: string | null;
    }>(
      `
      SELECT
        t.id::text,
        t.transaction_at::date::text AS filing_date,
        upper(trim(i.ticker)) AS ticker,
        coalesce(nullif(trim(i.name), ''), upper(trim(i.ticker))) AS company_name,
        f.slug AS actor_id,
        f.display_name AS actor_name,
        t.transaction_type,
        coalesce(t.amount_usd, t.amount_usd_mid)::float8 AS amount_usd,
        coalesce(t.asset_name, t.description) AS headline
      FROM politician_transactions t
      JOIN filers f ON f.id = t.filer_id
      JOIN issuers i ON i.id = t.issuer_id
      WHERE i.ticker IS NOT NULL
        AND length(trim(i.ticker)) BETWEEN 1 AND 6
        AND t.transaction_at >= (now() AT TIME ZONE 'UTC')::date - ($1::int || ' days')::interval
        AND t.transaction_at::date <= (now() AT TIME ZONE 'UTC')::date
      ORDER BY t.transaction_at DESC
      LIMIT 40
      `,
      [lookback],
    )),

    tryExploreQuery("recap.earnings", () => exploreQueryApi<{ ticker: string; name: string; earnings_date: string; days_ahead: string }>(
    `
    SELECT
      upper(trim(ticker)) AS ticker,
      coalesce(nullif(trim(name), ''), upper(trim(ticker))) AS name,
      earnings_date::text AS earnings_date,
      (earnings_date - current_date)::text AS days_ahead
    FROM companies
    WHERE ticker IS NOT NULL
      AND earnings_date IS NOT NULL
      AND earnings_date >= current_date
      AND earnings_date <= current_date + 14
    ORDER BY earnings_date ASC
    LIMIT 24
    `,
    )),
  ]);

  /** @type {RecapFiling[]} */
  const filings: RecapFiling[] = [];

  for (const row of insiders) {
    const side = insiderSide(row.code, row.acquired_disposed);
    filings.push({
      id: row.id,
      doc: recapDocLabel("insider", side),
      side,
      ticker: row.ticker,
      companyName: row.company_name,
      actorId: row.actor_id,
      actorName: row.actor_name,
      actorRole: row.actor_role ? `${row.actor_role} at ${row.company_name}` : `Insider at ${row.company_name}`,
      actorMode: "insider",
      amountUsd: row.amount_usd,
      code: row.code,
      headline: row.headline,
      priceSeries: [],
      dayMovePct: null,
      filingDate: row.filing_date,
    });
  }

  for (const row of politicians) {
    const side = politicianSide(row.transaction_type);
    filings.push({
      id: row.id,
      doc: recapDocLabel("politicians", side),
      side,
      ticker: row.ticker,
      companyName: row.company_name,
      actorId: row.actor_id,
      actorName: row.actor_name,
      actorRole: "Member of Congress",
      actorMode: "politicians",
      amountUsd: row.amount_usd,
      code: side === "buy" ? "P" : side === "sell" ? "S" : null,
      headline: row.headline,
      priceSeries: [],
      dayMovePct: null,
      filingDate: row.filing_date,
    });
  }

  const tickers = [
    ...filings.map((f) => String(f.ticker ?? "")),
    ...earningsRows.map((r) => r.ticker),
  ];
  const barMap = await tryExploreBars(tickers, 260);

  for (const f of filings) {
    const t = String(f.ticker ?? "").toUpperCase();
    const series = barMap.get(t) ?? [];
    f.priceSeries = series;
    f.dayMovePct = pctMoveFromCloses(series, 3);
  }

  const earningsSoon = earningsRows.map((row) => {
    const t = String(row.ticker ?? "").toUpperCase();
    const series = barMap.get(t) ?? [];
    const daysAhead = Number(row.days_ahead);
    return {
      id: `er-${t.toLowerCase()}`,
      ticker: t,
      companyName: row.name,
      earningsDateLabel: earningsDateLabel(row.earnings_date),
      daysAhead: Number.isFinite(daysAhead) ? daysAhead : null,
      proximityLabel: earningsProximityLabel(daysAhead),
      priceSeries: series,
      dayMovePct: pctMoveFromCloses(series, 3),
    };
  });

  return {
    ok: true,
    dayKey,
    filings,
    earningsSoon,
  };
}

export type ExploreDirectoryEvent = {
  id: string;
  date: string;
  ticker: string;
  name?: string;
  companyName?: string;
  /** Canonical filers.slug — use for dossier URLs, not slugify(display name). */
  actorSlug?: string;
  docType: string;
  trail: string;
  up: boolean;
  tickers?: string[];
  positionCount?: number;
  baseline13f?: boolean;
};

export async function buildExploreDirectoryEvents(opts?: { lookbackDays?: number }) {
  const lookback = Math.max(7, Math.min(21, opts?.lookbackDays ?? 14));

  const [insiders, politicians, institutions, companyFilings] = await Promise.all([
    tryExploreQuery("directory.insiders", () =>
      exploreQueryApi<{
      id: string;
      filing_date: string;
      ticker: string;
      name: string;
      actor_name: string;
      actor_slug: string;
      code: string | null;
      acquired_disposed: string | null;
      amount_usd: number | null;
    }>(
      `
      SELECT
        t.id::text,
        t.transaction_at::date::text AS filing_date,
        upper(trim(i.ticker)) AS ticker,
        coalesce(nullif(trim(i.name), ''), upper(trim(i.ticker))) AS name,
        f.display_name AS actor_name,
        f.slug AS actor_slug,
        t.transaction_code AS code,
        t.acquired_disposed,
        t.amount_usd::float8 AS amount_usd
      FROM insider_transactions t
      JOIN filers f ON f.id = t.filer_id
      JOIN issuers i ON i.id = t.issuer_id
      WHERE i.ticker IS NOT NULL
        AND t.transaction_at >= (now() AT TIME ZONE 'UTC')::date - ($1::int || ' days')::interval
      ORDER BY t.transaction_at DESC
      LIMIT 300
      `,
      [lookback],
      15_000,
    )),
    tryExploreQuery("directory.politicians", () =>
      exploreQueryApi<{
      id: string;
      filing_date: string;
      ticker: string;
      name: string;
      actor_name: string;
      actor_slug: string;
      transaction_type: string | null;
      amount_usd: number | null;
      amount_range: string | null;
    }>(
      `
      SELECT
        t.id::text,
        t.transaction_at::date::text AS filing_date,
        upper(trim(i.ticker)) AS ticker,
        coalesce(nullif(trim(i.name), ''), upper(trim(i.ticker))) AS name,
        f.display_name AS actor_name,
        f.slug AS actor_slug,
        t.transaction_type,
        coalesce(t.amount_usd, t.amount_usd_mid)::float8 AS amount_usd,
        nullif(trim(t.amount_range), '') AS amount_range
      FROM politician_transactions t
      JOIN filers f ON f.id = t.filer_id
      JOIN issuers i ON i.id = t.issuer_id
      WHERE i.ticker IS NOT NULL
        AND t.transaction_at >= (now() AT TIME ZONE 'UTC')::date - ($1::int || ' days')::interval
      ORDER BY t.transaction_at DESC
      LIMIT 200
      `,
      [lookback],
      12_000,
    )),
    tryExploreQuery("directory.institutions", () =>
      exploreQueryApi<{
      id: string;
      filing_date: string;
      ticker: string;
      name: string;
      actor_name: string;
      actor_slug: string;
      activity: string | null;
      amount_usd: number | null;
      shares: number | null;
    }>(
      `
      SELECT
        t.id::text,
        t.transaction_at::date::text AS filing_date,
        upper(trim(i.ticker)) AS ticker,
        coalesce(nullif(trim(i.name), ''), upper(trim(i.ticker))) AS name,
        f.display_name AS actor_name,
        f.slug AS actor_slug,
        t.activity,
        t.amount_usd::float8 AS amount_usd,
        t.shares::float8 AS shares
      FROM institution_transactions t
      JOIN filers f ON f.id = t.filer_id
      JOIN issuers i ON i.id = t.issuer_id
      WHERE t.data_quality_version>=1 AND i.ticker IS NOT NULL
        AND t.transaction_at >= (now() AT TIME ZONE 'UTC')::date - ($1::int || ' days')::interval
        AND lower(trim(f.display_name)) NOT IN ('institution', 'institutions', 'unknown', 'filer', 'insider', 'politician')
      ORDER BY t.transaction_at DESC
      LIMIT 120
      `,
      [lookback],
      20_000,
    )),
    tryExploreQuery("directory.company_filings", () =>
      exploreQueryApi<{
      id: string;
      filing_date: string;
      ticker: string;
      name: string;
      form: string | null;
      feed_kind: string | null;
      headline: string | null;
    }>(
      `
      SELECT
        f.id::text,
        coalesce(f.event_at, f.filed_at, f.parsed_at)::date::text AS filing_date,
        upper(trim(i.ticker)) AS ticker,
        coalesce(nullif(trim(i.name), ''), upper(trim(i.ticker))) AS name,
        f.form,
        f.feed_kind::text AS feed_kind,
        coalesce(f.title, f.source_key) AS headline
      FROM filings f
      JOIN issuers i ON i.id = f.issuer_id
      WHERE i.ticker IS NOT NULL
        AND (
          f.feed_kind = 'research'::feed_kind
          OR coalesce(f.form, '') ILIKE '8-K%'
          OR coalesce(f.form, '') ILIKE '10-Q%'
          OR coalesce(f.form, '') ILIKE '10-K%'
        )
        AND coalesce(f.event_at, f.filed_at, f.parsed_at) >= (now() AT TIME ZONE 'UTC')::date - ($1::int || ' days')::interval
      ORDER BY coalesce(f.event_at, f.filed_at, f.parsed_at) DESC
      LIMIT 200
      `,
      [lookback],
      25_000,
    )),
  ]);

  const companyTickers = companyFilings.map((r) => r.ticker);
  const barMap = await tryExploreBars(companyTickers, 8);
  const secTitles = await getSecTickerTitleMap().catch(() => new Map<string, string>());

  function resolveCompanyDisplayName(ticker: string, dbName: string): string {
    const tick = String(ticker ?? "").trim().toUpperCase();
    const sec = secTitles.get(tick);
    if (sec) {
      const formatted = formatCompanyDisplayName(sec);
      if (formatted && formatted.toUpperCase() !== tick) return formatted;
    }
    const n = String(dbName ?? "").trim();
    if (n && n.toUpperCase() !== tick) return n;
    return sec ? formatCompanyDisplayName(sec) : tick;
  }

  /** @type {ExploreDirectoryEvent[]} */
  const companyEvents: ExploreDirectoryEvent[] = companyFilings.map((row) => {
    const series = barMap.get(row.ticker) ?? [];
    const move = pctMoveFromCloses(series, 3);
    const docType = companyDocType(row.form, row.feed_kind, row.headline);
    return {
      id: `c-${row.id}`,
      date: row.filing_date,
      ticker: row.ticker,
      name: resolveCompanyDisplayName(row.ticker, row.name),
      docType,
      trail: formatTrailPct(move),
      up: (move ?? 0) >= 0,
    };
  });

  /** @type {ExploreDirectoryEvent[]} */
  const investorEvents: ExploreDirectoryEvent[] = [];

  for (const row of insiders) {
    const side = insiderSide(row.code, row.acquired_disposed);
    const signed = side === "sell" ? -(row.amount_usd ?? 0) : row.amount_usd ?? 0;
    investorEvents.push({
      id: `a-${row.id}`,
      date: row.filing_date,
      name: row.actor_name,
      actorSlug: row.actor_slug,
      ticker: row.ticker,
      companyName: formatCompanyDisplayName(row.name) || row.name || row.ticker,
      docType: insiderDocType(side),
      trail: formatTrailUsd(signed),
      up: signed >= 0,
    });
  }

  for (const row of politicians) {
    const side = politicianSide(row.transaction_type);
    const signed = side === "sell" ? -(row.amount_usd ?? 0) : row.amount_usd ?? 0;
    investorEvents.push({
      id: `a-${row.id}`,
      date: row.filing_date,
      name: row.actor_name,
      actorSlug: row.actor_slug,
      ticker: row.ticker,
      companyName: formatCompanyDisplayName(row.name) || row.name || row.ticker,
      docType: politicianDocType(side),
      trail: formatTrailUsdRange(row.amount_range, signed),
      up: signed >= 0,
    });
  }

  for (const row of institutions) {
    if (!isPlausibleTrackedFiler(row.actor_name, row.amount_usd)) continue;
    const activity = String(row.activity ?? "").trim();
    if (activity === "Held") continue;
    if (activity !== "Increased stake" && activity !== "Reduced stake" && activity !== "New position") {
      continue;
    }
    const side = institutionSide(row.activity);
    investorEvents.push({
      id: `a-${row.id}`,
      date: row.filing_date,
      name: row.actor_name,
      actorSlug: row.actor_slug,
      ticker: row.ticker,
      companyName: formatCompanyDisplayName(row.name) || row.name || row.ticker,
      docType: institutionDocType(side),
      trail: formatInstitutionTrail(row.activity, row.shares),
      up: side !== "sell",
    });
  }

  return { companyEvents, investorEvents };
}
