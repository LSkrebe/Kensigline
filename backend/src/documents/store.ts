import { db } from "../core/db.js";
import type { ResearchDocExtractV2 } from "./extract.js";
import { slimResearchDocumentData } from "./research-data-slim.js";
import { formatUsdCompact } from "../shared/money.js";
import { scoreResearchDocument } from "../core/idea-score.js";
import { invalidateTickerContextCache } from "../core/ticker-context-cache.js";
import { scheduleCompanyDossierRefresh } from "../core/dossier-cache.js";
import { invalidateAnalyseModelCache } from "../analyse/build-model.js";
import { isPlausibleTrackedFiler } from "../research/market/tracked-investors-filter.js";
import { parseEventTimeMs, sanitizeEventAtForFeed, FEED_FUTURE_GRACE_DAYS } from "../shared/document-activity-at.js";
import { lookupPoliticianCommittees, formatPoliticianDisplayName } from "../politicians/committees.js";
import { isOlderThanRetentionWindow } from "../shared/ingest-policy.js";
import {
  ensureIssuer,
  insertFiling,
  insertResearchEvent,
  replaceResearchDrivers,
  upsertFeedEntry,
} from "../v2/canonical.js";

const GOV_LINK_THRESHOLD = () => Number(process.env.GOV_CONTRACT_LINK_THRESHOLD ?? 0.72);

export function mapQueueSourceToDocKind(sourceType: string): string {
  const s = String(sourceType ?? "").toLowerCase();
  if (s === "research_sec" || s === "bosha_sec") return "filing";
  if (s === "research_press_rss" || s === "bosha_press_rss") return "press";
  if (s === "research_transcript_rss" || s === "bosha_transcript_rss") return "transcript";
  if (s === "research_gov_contract" || s === "bosha_gov_contract") return "gov_contract";
  return "filing";
}

export async function insertResearchDocument(args: {
  queueId: string | null;
  contentSha256: string;
  sourceType: string;
  url: string | null;
  out: ResearchDocExtractV2;
  publishedAt: string | null;
}): Promise<string | null> {
  const dup = await db.one<{ id: string }>(
    `SELECT id FROM filings WHERE content_sha256 = $1 LIMIT 1`,
    [args.contentSha256],
  );
  if (dup?.id) return null;

  if (isOlderThanRetentionWindow(args.publishedAt) || isOlderThanRetentionWindow(args.out.event_at)) {
    console.info(
      "[retention] skip research insert outside 2y window",
      JSON.stringify({ publishedAt: args.publishedAt, event_at: args.out.event_at }),
    );
    return null;
  }

  const ticker = args.out.primary_ticker?.trim().toUpperCase() ?? null;
  const isGov = args.out.source_key === "Gov contract";
  const linkConf = isGov ? args.out.link_confidence : null;
  const showOnTicker = !isGov || (linkConf != null && linkConf >= GOV_LINK_THRESHOLD());

  const publishedAt = args.publishedAt ?? new Date().toISOString();
  const now = new Date();
  const graceMs = FEED_FUTURE_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const llmAt = args.out.event_at;
  const llmMs = parseEventTimeMs(llmAt);
  let catalystAt = args.out.catalyst_at ? String(args.out.catalyst_at) : null;
  if (!catalystAt && llmMs > now.getTime() + graceMs) {
    catalystAt = llmAt;
  }
  const eventAt = sanitizeEventAtForFeed({
    candidate: llmAt,
    filedAt: publishedAt,
    parsedAt: now.toISOString(),
    now,
  });
  const storedOut = {
    ...args.out,
    event_at: eventAt,
    ...(catalystAt ? { catalyst_at: catalystAt } : {}),
  };
  const slimData = slimResearchDocumentData(storedOut);
  const idea = scoreResearchDocument({
    analysis: args.out.analysis,
    source_key: args.out.source_key,
    feed_kind: "research",
    event_at: eventAt,
    data: slimData,
  });

  const issuer = ticker
    ? await ensureIssuer({ ticker, name: ticker })
    : null;

  const filingId = await insertFiling({
    queueId: args.queueId,
    sourceType: args.sourceType,
    feedKind: "research",
    form: mapQueueSourceToDocKind(args.sourceType),
    issuerId: issuer?.id ?? null,
    url: args.url,
    title: args.out.title,
    sourceKey: args.out.source_key,
    analysis: args.out.analysis,
    filedAt: publishedAt,
    eventAt,
    contentSha256: args.contentSha256,
    signalScore: idea.idea_score,
    signalLabel: idea.idea_best ? "best" : null,
    signalReasons: idea.idea_reasons,
    programKeys: args.out.program_keys,
    showOnTicker,
  });

  await insertResearchEvent({
    filingId,
    issuerId: issuer?.id ?? null,
    sourceKey: args.out.source_key,
    analysis: args.out.analysis,
    eventAt,
    programKeys: args.out.program_keys,
    showOnTicker,
    forwardRevenueGrowthPct:
      typeof (slimData as { forward_revenue_growth_pct?: number }).forward_revenue_growth_pct === "number"
        ? (slimData as { forward_revenue_growth_pct: number }).forward_revenue_growth_pct
        : null,
    signalScore: idea.idea_score,
    signalLabel: idea.idea_best ? "best" : null,
    signalReasons: idea.idea_reasons,
  });

  const drivers = Array.isArray(args.out.business_drivers) ? args.out.business_drivers : [];
  if (drivers.length) {
    await replaceResearchDrivers(
      filingId,
      issuer?.id ?? null,
      drivers.map((d) => ({
        label: String(d.label ?? "").trim() || "driver",
        driverKind: d.driver_kind ?? null,
        rollsUpToRevenue: d.rolls_up_to_revenue ?? null,
        valueUsdMillions:
          d.value_usd_millions != null
            ? Number(d.value_usd_millions)
            : d.value != null
              ? Number(d.value)
              : null,
        unit: d.unit ?? null,
        period: d.period ?? null,
      })),
    );
  }

  if (issuer && showOnTicker) {
    await upsertFeedEntry({
      feedKind: "research",
      issuerId: issuer.id,
      filingId,
      feedAt: eventAt,
      feedLabel: args.out.source_key,
      sourceKey: args.out.source_key,
      signalScore: idea.idea_score,
      signalLabel: idea.idea_best ? "best" : null,
      signalReasons: idea.idea_reasons,
      paperDocCount: 1,
    });
  }

  if (ticker) {
    void invalidateTickerContextCache(ticker);
    invalidateAnalyseModelCache(ticker);
    if (process.env.DOSSIER_CACHE_REFRESH_ON_INGEST !== "0") {
      scheduleCompanyDossierRefresh(ticker, async (tick) => {
        const { buildCompanyDossierPayload } = await import("../research/company-dossier.js");
        return buildCompanyDossierPayload(tick);
      });
    }
  }

  return filingId;
}

/** @deprecated Writers use v2/canonical replace*Transactions. Kept as no-op for old call sites. */
export async function syncInsiderTransactionsFromDocument(_documentId: string, _ticker: string, _data: any) {}

/** @deprecated Writers use v2/canonical replacePoliticianTransactions. */
export async function syncPoliticianTransactionsFromDocument(_documentId: string, _ticker: string, _data: any) {}

/** @deprecated Writers use v2/canonical replaceInstitutionTransactions. */
export async function syncInstitutionFilingsFromDocument(_documentId: string, _ticker: string, _data: any) {}

export type PaperDocumentRow = {
  id: string;
  source: string;
  filedAt: string;
  url: string | null;
  analysis: string;
  programKeys: string[];
  idea_score?: number;
  idea_best?: boolean;
  idea_reasons?: string[];
};

export async function loadInsiderFlowsForTicker(ticker: string, limit = 80) {
  const t = ticker.trim().toUpperCase();
  const rows = await db.query<{
    insider_role: string | null;
    insider_name: string;
    transaction_code: string | null;
    amount_usd: string | null;
    transaction_at: string;
    url: string | null;
  }>(
    `
    SELECT
      it.role AS insider_role,
      f.display_name AS insider_name,
      it.transaction_code,
      it.amount_usd::text,
      it.transaction_at::text,
      fil.url
    FROM insider_transactions it
    JOIN filers f ON f.id = it.filer_id
    JOIN issuers i ON i.id = it.issuer_id
    LEFT JOIN filings fil ON fil.id = it.filing_id
    WHERE i.ticker = $1
    ORDER BY it.transaction_at DESC
    LIMIT $2
    `,
    [t, limit],
  );
  return rows.map((r) => ({
    key: r.insider_role ?? "Insider",
    person: r.insider_name,
    date: r.transaction_at,
    amount: r.amount_usd != null && Number(r.amount_usd) > 0 ? formatUsdCompact(Number(r.amount_usd)) : "—",
    transactionCode: r.transaction_code,
    url: r.url ? String(r.url).trim() : null,
  }));
}

export async function loadPoliticianFlowsForTicker(ticker: string, limit = 80) {
  const t = ticker.trim().toUpperCase();
  const rows = await db.query<{
    politician_name: string;
    chamber: string | null;
    committee: string | null;
    transaction_type: string | null;
    amount_usd_mid: string | null;
    transaction_at: string;
    url: string | null;
  }>(
    `
    SELECT
      f.display_name AS politician_name,
      pt.chamber,
      pt.committee,
      pt.transaction_type,
      pt.amount_usd_mid::text,
      pt.transaction_at::text,
      fil.url
    FROM politician_transactions pt
    JOIN filers f ON f.id = pt.filer_id
    JOIN issuers i ON i.id = pt.issuer_id
    LEFT JOIN filings fil ON fil.id = pt.filing_id
    WHERE i.ticker = $1
    ORDER BY pt.transaction_at DESC
    LIMIT $2
    `,
    [t, limit],
  );
  if (!rows.length) return [];
  const committees = await lookupPoliticianCommittees(rows.map((r) => r.politician_name));
  return rows.map((r) => {
    const name = formatPoliticianDisplayName(r.politician_name);
    return {
      name,
      chamber: r.chamber ?? "house",
      committee: r.committee || committees.get(r.politician_name) || committees.get(name) || null,
      date: r.transaction_at,
      amount: r.amount_usd_mid != null && Number(r.amount_usd_mid) > 0 ? formatUsdCompact(Number(r.amount_usd_mid)) : "—",
      transactionType: r.transaction_type,
      url: r.url ? String(r.url).trim() : null,
    };
  });
}

export async function loadFilings13fForTicker(ticker: string, limit = 40) {
  const t = ticker.trim().toUpperCase();
  const rows = await db.query<{
    filer: string;
    activity: string | null;
    amount_usd: string | null;
    filed_at: string;
    url: string | null;
  }>(
    `
    SELECT
      f.display_name AS filer,
      it.activity,
      it.amount_usd::text,
      it.transaction_at::text AS filed_at,
      fil.url
    FROM institution_transactions it
    JOIN filers f ON f.id = it.filer_id
    JOIN issuers i ON i.id = it.issuer_id
    LEFT JOIN filings fil ON fil.id = it.filing_id
    WHERE i.ticker = $1
    ORDER BY it.transaction_at DESC
    LIMIT $2
    `,
    [t, limit],
  );
  return rows
    .map((r) => ({
      filer: r.filer,
      activity: r.activity,
      date: r.filed_at,
      amount: r.amount_usd != null && Number(r.amount_usd) > 0 ? formatUsdCompact(Number(r.amount_usd)) : "—",
      amountUsd: r.amount_usd != null ? Number(r.amount_usd) : null,
      url: r.url ? String(r.url).trim() : null,
    }))
    .filter((r) => isPlausibleTrackedFiler(r.filer, r.amountUsd))
    .map(({ amountUsd: _a, ...rest }) => rest);
}

export async function loadPaperDocumentsForTicker(ticker: string, limit = 120): Promise<PaperDocumentRow[]> {
  const t = ticker.trim().toUpperCase();
  const rows = await db.queryApi<{
    id: string;
    source_key: string | null;
    event_at: string | null;
    url: string | null;
    title: string | null;
    analysis: string | null;
    program_keys: string[] | null;
    feed_kind: string | null;
    signal_score: number | null;
    signal_label: string | null;
    signal_reasons: string[] | null;
  }>(
    `
    SELECT
      f.id::text,
      f.source_key,
      f.event_at::text,
      f.url,
      f.title,
      f.analysis,
      f.program_keys,
      f.feed_kind::text,
      f.signal_score,
      f.signal_label,
      f.signal_reasons
    FROM filings f
    JOIN issuers i ON i.id = f.issuer_id
    WHERE i.ticker = $1
      AND f.feed_kind = 'research'
      AND f.show_on_ticker IS NOT FALSE
      AND (
        (f.analysis IS NOT NULL AND length(trim(f.analysis)) > 0)
        OR (f.title IS NOT NULL AND length(trim(f.title)) > 0)
      )
    ORDER BY f.event_at DESC NULLS LAST, f.parsed_at DESC
    LIMIT $2
    `,
    [t, limit],
    8_000,
  );

  return rows.map((r) => {
    const idea = scoreResearchDocument({
      analysis: r.analysis,
      source_key: r.source_key,
      feed_kind: r.feed_kind,
      event_at: r.event_at,
    });
    const programKeys = Array.isArray(r.program_keys)
      ? r.program_keys.map((k) => String(k ?? "").trim()).filter(Boolean)
      : [];
    return {
      id: r.id,
      source: String(r.source_key ?? "Other"),
      filedAt: r.event_at ?? new Date().toISOString(),
      url: r.url,
      analysis: String(r.analysis ?? r.title ?? "").trim() || String(r.source_key ?? "Filing"),
      programKeys,
      idea_score: r.signal_score ?? idea.idea_score,
      idea_best: r.signal_label != null ? Boolean(r.signal_label) : idea.idea_best,
      idea_reasons: r.signal_reasons?.length ? r.signal_reasons : idea.idea_reasons,
    };
  });
}

export type InstitutionShareSnapshot = {
  filer: string;
  shares: number;
  asOf: string;
};

export async function loadInstitutionShareSnapshotsForTicker(
  ticker: string,
  limit = 400,
): Promise<InstitutionShareSnapshot[]> {
  const t = ticker.trim().toUpperCase();
  const rows = await db.query<{
    filer: string;
    shares: string | null;
    as_of: string;
  }>(
    `
    SELECT
      f.display_name AS filer,
      it.shares::text,
      it.transaction_at::text AS as_of
    FROM institution_transactions it
    JOIN filers f ON f.id = it.filer_id
    JOIN issuers i ON i.id = it.issuer_id
    WHERE i.ticker = $1
      AND it.shares IS NOT NULL
    ORDER BY it.transaction_at DESC
    LIMIT $2
    `,
    [t, limit],
  );

  const out: InstitutionShareSnapshot[] = [];
  for (const row of rows) {
    const shares = row.shares != null ? Number(row.shares) : NaN;
    if (!Number.isFinite(shares) || shares <= 0) continue;
    out.push({
      filer: String(row.filer ?? "Institution").trim(),
      shares,
      asOf: row.as_of,
    });
  }
  return out;
}

export type InsiderOwnershipFiling = {
  url: string;
  eventAt: string;
  sourceKey: string;
};

export async function loadInsiderOwnershipFilingsForTicker(
  ticker: string,
  limit = 120,
): Promise<InsiderOwnershipFiling[]> {
  const t = ticker.trim().toUpperCase();
  const rows = await db.query<{ url: string | null; event_at: string | null; source_key: string | null }>(
    `
    SELECT f.url, f.event_at::text, f.source_key
    FROM filings f
    JOIN issuers i ON i.id = f.issuer_id
    WHERE i.ticker = $1
      AND f.feed_kind = 'insider'
      AND f.source_key IN ('Form 3', 'Form 5')
      AND f.url IS NOT NULL
    ORDER BY f.event_at DESC NULLS LAST
    LIMIT $2
    `,
    [t, limit],
  );

  return rows
    .filter((r): r is { url: string; event_at: string | null; source_key: string | null } => Boolean(r.url))
    .map((r) => ({
      url: r.url,
      eventAt: r.event_at ?? new Date().toISOString(),
      sourceKey: String(r.source_key ?? "Form 3"),
    }));
}
