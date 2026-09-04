import { isPlausibleTrackedFiler } from "../research/market/tracked-investors-filter.js";
import {
  exploreQueryApi,
  formatInstitutionTrail,
  formatTrailUsd,
  insiderDocType,
  insiderSide,
  institutionDocType,
  institutionSide,
  politicianDocType,
  politicianSide,
  tryExploreQuery,
} from "./helpers.js";
import type { ExploreDirectoryEvent } from "./recap-day.js";
import { EXPLORE_WATCHLIST_CATALOG } from "./watchlist-catalog.js";

type RawTxnRow = {
  id: string;
  filing_date: string;
  ticker: string;
  name: string;
  actor_name: string;
  actor_slug: string;
  transaction_type?: string | null;
  amount_usd?: number | null;
  activity?: string | null;
  shares?: number | null;
  code?: string | null;
  acquired_disposed?: string | null;
};

function politicianEvent(row: RawTxnRow): ExploreDirectoryEvent {
  const side = politicianSide(row.transaction_type ?? null);
  const signed = side === "sell" ? -(row.amount_usd ?? 0) : row.amount_usd ?? 0;
  return {
    id: `wl-p-${row.id}`,
    date: row.filing_date,
    name: row.actor_name,
    actorSlug: row.actor_slug,
    ticker: row.ticker,
    docType: politicianDocType(side),
    trail: formatTrailUsd(signed),
    up: signed >= 0,
  };
}

function insiderEvent(row: RawTxnRow): ExploreDirectoryEvent {
  const side = insiderSide(row.code ?? null, row.acquired_disposed ?? null);
  const signed = side === "sell" ? -(row.amount_usd ?? 0) : row.amount_usd ?? 0;
  return {
    id: `wl-a-${row.id}`,
    date: row.filing_date,
    name: row.actor_name,
    actorSlug: row.actor_slug,
    ticker: row.ticker,
    docType: insiderDocType(side),
    trail: formatTrailUsd(signed),
    up: signed >= 0,
  };
}

function institutionEvent(row: RawTxnRow): ExploreDirectoryEvent | null {
  if (!isPlausibleTrackedFiler(row.actor_name, row.amount_usd ?? null)) return null;
  const activity = String(row.activity ?? "").trim();
  if (activity !== "Increased stake" && activity !== "Reduced stake" && activity !== "New position") {
    return null;
  }
  const side = institutionSide(activity);
  return {
    id: `wl-i-${row.id}`,
    date: row.filing_date,
    name: row.actor_name,
    actorSlug: row.actor_slug,
    ticker: row.ticker,
    docType: institutionDocType(side),
    trail: formatInstitutionTrail(activity, row.shares ?? null),
    up: side !== "sell",
  };
}

function slugMatches(actorSlug: string, slugs: string[]): boolean {
  const s = String(actorSlug ?? "").trim().toLowerCase();
  return slugs.some((alias) => alias.toLowerCase() === s);
}

function countSameDayRows(rows: RawTxnRow[], date: string): number {
  return rows.filter((r) => String(r.filing_date) === date).length;
}

async function loadPoliticianRows(slugs: string[]): Promise<RawTxnRow[]> {
  if (!slugs.length) return [];
  return tryExploreQuery("watchlist.politicians", () =>
    exploreQueryApi<RawTxnRow>(
      `
      SELECT
        t.id::text,
        t.transaction_at::date::text AS filing_date,
        upper(trim(i.ticker)) AS ticker,
        coalesce(nullif(trim(i.name), ''), upper(trim(i.ticker))) AS name,
        f.display_name AS actor_name,
        f.slug AS actor_slug,
        t.transaction_type,
        coalesce(t.amount_usd, t.amount_usd_mid)::float8 AS amount_usd
      FROM politician_transactions t
      JOIN filers f ON f.id = t.filer_id
      JOIN issuers i ON i.id = t.issuer_id
      WHERE f.slug = ANY($1::text[])
        AND i.ticker IS NOT NULL
        AND f.slug <> 'politician'
      ORDER BY t.transaction_at DESC, t.id DESC
      `,
      [slugs],
      15_000,
    ),
  );
}

async function loadInsiderRows(slugs: string[]): Promise<RawTxnRow[]> {
  if (!slugs.length) return [];
  return tryExploreQuery("watchlist.insiders", () =>
    exploreQueryApi<RawTxnRow>(
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
      WHERE f.slug = ANY($1::text[])
        AND i.ticker IS NOT NULL
      ORDER BY t.transaction_at DESC, t.id DESC
      `,
      [slugs],
      15_000,
    ),
  );
}

async function loadInstitutionRows(slugs: string[]): Promise<RawTxnRow[]> {
  if (!slugs.length) return [];
  return tryExploreQuery("watchlist.institutions", () =>
    exploreQueryApi<RawTxnRow>(
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
      WHERE f.slug = ANY($1::text[])
        AND i.ticker IS NOT NULL
        AND t.activity IN ('Increased stake', 'Reduced stake', 'New position')
      ORDER BY t.transaction_at DESC, t.id DESC
      `,
      [slugs],
      15_000,
    ),
  );
}

export type ExploreWatchlistLatestEvent = ExploreDirectoryEvent & {
  extraSameDay?: number;
  recentEvents?: ExploreDirectoryEvent[];
};

const WATCHLIST_RECENT_EVENTS_MAX = 3;

function rowToEvent(person: (typeof EXPLORE_WATCHLIST_CATALOG)[number], row: RawTxnRow): ExploreDirectoryEvent | null {
  return person.mode === "politicians"
    ? politicianEvent(row)
    : person.mode === "insiders"
      ? insiderEvent(row)
      : institutionEvent(row);
}

function collectRecentEvents(
  person: (typeof EXPLORE_WATCHLIST_CATALOG)[number],
  sorted: RawTxnRow[],
  max = WATCHLIST_RECENT_EVENTS_MAX,
): ExploreDirectoryEvent[] {
  const out: ExploreDirectoryEvent[] = [];
  const seen = new Set<string>();
  for (const row of sorted) {
    const candidate = rowToEvent(person, row);
    if (!candidate) continue;
    const key = `${candidate.id}|${candidate.ticker}|${candidate.date}|${candidate.trail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
    if (out.length >= max) break;
  }
  return out;
}

/** Latest real transaction per watchlist catalog person (full history, all slug aliases). */
export async function buildExploreWatchlistLatest(): Promise<ExploreWatchlistLatestEvent[]> {
  const politicianSlugs = [
    ...new Set(
      EXPLORE_WATCHLIST_CATALOG.filter((p) => p.mode === "politicians").flatMap((p) => p.slugs),
    ),
  ];
  const insiderSlugs = [
    ...new Set(EXPLORE_WATCHLIST_CATALOG.filter((p) => p.mode === "insiders").flatMap((p) => p.slugs)),
  ];
  const institutionSlugs = [
    ...new Set(
      EXPLORE_WATCHLIST_CATALOG.filter((p) => p.mode === "institutions").flatMap((p) => p.slugs),
    ),
  ];

  const [politicianRows, insiderRows, institutionRows] = await Promise.all([
    loadPoliticianRows(politicianSlugs),
    loadInsiderRows(insiderSlugs),
    loadInstitutionRows(institutionSlugs),
  ]);

  const out: ExploreWatchlistLatestEvent[] = [];

  for (const person of EXPLORE_WATCHLIST_CATALOG) {
    const pool =
      person.mode === "politicians"
        ? politicianRows
        : person.mode === "insiders"
          ? insiderRows
          : institutionRows;
    const matched = pool.filter((r) => slugMatches(r.actor_slug, person.slugs));
    const sorted = [...matched].sort((a, b) => {
      const dateCmp = String(b.filing_date).localeCompare(String(a.filing_date));
      if (dateCmp !== 0) return dateCmp;
      return String(b.id).localeCompare(String(a.id));
    });

    const recentEvents = collectRecentEvents(person, sorted);
    const event = recentEvents[0] ?? null;
    if (!event) continue;

    const latest = sorted.find((row) => {
      const candidate = rowToEvent(person, row);
      return candidate?.id === event.id;
    });
    if (!latest) continue;

    const sameDay = Math.max(0, countSameDayRows(matched, latest.filing_date) - 1);
    out.push({ ...event, name: person.name, extraSameDay: sameDay, recentEvents });
  }

  return out;
}
