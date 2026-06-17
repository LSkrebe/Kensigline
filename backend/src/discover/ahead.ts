import { db } from "../core/db.js";
import {
  buildCatalystsFromStudies,
  fetchClinicalStudiesForCompany,
} from "../research/clinical/trials.js";
import { isIdeaGreenHighlight } from "../core/idea-score.js";
import {
  inferIntelMode,
  isStrictlyUpcomingDay,
  mapCatalystAheadEvent,
  mapDocumentToDiscoverEvent,
  mapEarningsAheadEvent,
} from "./map.js";
import type { DiscoverEvent } from "./types.js";

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

function discoverEnvInt(key: string, fallback: number, lo: number, hi: number) {
  const raw = Number(process.env[key]);
  if (!Number.isFinite(raw)) return fallback;
  return clampInt(raw, lo, hi);
}

async function loadUpcomingEarnings(aheadDays: number, limit: number): Promise<DiscoverEvent[]> {
  const rows = await db.query<{
    ticker: string;
    name: string | null;
    industry: string | null;
    earnings_date: string;
  }>(
    `
    SELECT
      upper(trim(ticker)) AS ticker,
      name,
      industry,
      earnings_date::text AS earnings_date
    FROM companies
    WHERE ticker IS NOT NULL
      AND earnings_date IS NOT NULL
      AND earnings_date > CURRENT_DATE
      AND earnings_date <= CURRENT_DATE + ($1 || ' days')::interval
    ORDER BY earnings_date ASC
    LIMIT $2
    `,
    [String(Math.max(1, aheadDays)), limit],
  );

  return rows.map((r) =>
    mapEarningsAheadEvent({
      ticker: r.ticker,
      companyName: String(r.name ?? r.ticker).trim() || r.ticker,
      earningsDate: r.earnings_date,
      intelMode: inferIntelMode(null, r.industry),
    }),
  );
}

async function loadClinicalTickerCandidates(limit: number): Promise<Array<{ ticker: string; name: string }>> {
  const rows = await db.query<{ ticker: string; name: string | null }>(
    `
    SELECT DISTINCT ON (upper(trim(x.ticker)))
      upper(trim(x.ticker)) AS ticker,
      COALESCE(NULLIF(trim(c.name), ''), upper(trim(x.ticker))) AS name
    FROM (
      SELECT ticker FROM documents WHERE feed_kind = 'pharma' AND ticker IS NOT NULL
      UNION ALL
      SELECT ticker FROM companies
      WHERE ticker IS NOT NULL
        AND (
          industry ILIKE '%biotech%'
          OR industry ILIKE '%biopharm%'
          OR industry ILIKE '%pharma%'
          OR industry ILIKE '%drug%'
          OR industry ILIKE '%life science%'
        )
    ) x
    LEFT JOIN companies c ON upper(trim(c.ticker)) = upper(trim(x.ticker))
    WHERE length(trim(x.ticker)) BETWEEN 1 AND 6
    ORDER BY upper(trim(x.ticker))
    LIMIT $1
    `,
    [limit],
  );
  return rows.map((r) => ({
    ticker: r.ticker,
    name: String(r.name ?? r.ticker).trim() || r.ticker,
  }));
}

async function loadUpcomingDocumentCatalysts(aheadDays: number, limit: number): Promise<DiscoverEvent[]> {
  const rows = await db.query<{
    id: string;
    ticker: string;
    company_name: string | null;
    event_at: string;
    title: string | null;
    source_key: string | null;
    feed_kind: string | null;
    program_drug: string | null;
    program_phase: string | null;
    industry: string | null;
    url: string | null;
    analysis: string | null;
    data: unknown;
  }>(
    `
    SELECT
      d.id,
      upper(trim(d.ticker)) AS ticker,
      COALESCE(NULLIF(trim(c.name), ''), upper(trim(d.ticker))) AS company_name,
      d.event_at::text AS event_at,
      COALESCE(NULLIF(trim(d.title), ''), NULLIF(trim(d.feed_label), ''), d.source_key) AS title,
      d.source_key,
      d.feed_kind,
      d.program_drug,
      d.program_phase,
      c.industry,
      d.url,
      d.analysis,
      d.data
    FROM documents d
    LEFT JOIN companies c ON upper(trim(c.ticker)) = upper(trim(d.ticker))
    WHERE d.ticker IS NOT NULL
      AND d.event_at IS NOT NULL
      AND d.event_at::date > CURRENT_DATE
      AND d.event_at < date_trunc('day', now()) + ($1 || ' days')::interval
      AND d.show_on_ticker IS NOT FALSE
      AND (
        d.feed_kind IN ('research', 'pharma')
        OR d.source_key IN ('ClinicalTrials.gov', 'Press release')
      )
    ORDER BY d.event_at ASC
    LIMIT $2
    `,
    [String(Math.max(1, aheadDays)), limit],
  );

  return rows.map((row) =>
    mapDocumentToDiscoverEvent(
      {
        ...row,
        event_at: row.event_at,
      },
      new Set(rows.map((r) => r.ticker)),
    ),
  );
}

async function loadClinicalCatalysts(aheadDays: number, perTickerLimit: number): Promise<DiscoverEvent[]> {
  const tickerCap = discoverEnvInt("DISCOVER_CLINICAL_TICKERS", 12, 1, 40);
  const candidates = await loadClinicalTickerCandidates(tickerCap);
  const out: DiscoverEvent[] = [];

  const batches = await Promise.all(
    candidates.map(async ({ ticker, name }) => {
      try {
        const studies = await fetchClinicalStudiesForCompany({ ticker, companyName: name });
        const catalysts = buildCatalystsFromStudies(studies, { limit: perTickerLimit });
        const rows: DiscoverEvent[] = [];
        for (const c of catalysts) {
          if (!c.at) continue;
          if (!isStrictlyUpcomingDay(c.at)) continue;
          const mapped = mapCatalystAheadEvent({
            ticker,
            companyName: name,
            id: c.id,
            label: c.label,
            at: c.at,
            phase: c.phase,
            programKey: c.programKey,
            url: c.url,
            kind: c.kind,
          });
          if (mapped) rows.push(mapped);
        }
        return rows;
      } catch (e) {
        console.error("discover_clinical_catalyst_failed", ticker, e);
        return [];
      }
    }),
  );

  for (const rows of batches) out.push(...rows);
  return out;
}

export async function loadUpcomingDiscoverEvents(opts: {
  aheadDays: number;
  limit: number;
}): Promise<DiscoverEvent[]> {
  const perSide = opts.limit;
  const [earnings, documentCatalysts, clinical] = await Promise.all([
    loadUpcomingEarnings(opts.aheadDays, perSide),
    loadUpcomingDocumentCatalysts(opts.aheadDays, perSide),
    loadClinicalCatalysts(opts.aheadDays, 4),
  ]);

  const merged = [...earnings, ...documentCatalysts, ...clinical];
  const seen = new Set<string>();
  const deduped: DiscoverEvent[] = [];
  for (const e of merged) {
    const key = `${e.ticker}|${e.at.slice(0, 10)}|${e.title}|${e.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }

  deduped.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return deduped
    .filter((e) => isStrictlyUpcomingDay(e.at) && isIdeaGreenHighlight(e))
    .slice(0, perSide);
}
