import { db } from "../core/db.js";
import type { ResearchDocExtractV2 } from "./extract.js";
import { slimResearchDocumentData } from "./research-data-slim.js";
import { formatUsdCompact } from "../shared/money.js";
import { scoreResearchDocument } from "../core/idea-score.js";
import { isoTimestampFromDb } from "../shared/db-time.js";
import { invalidateTickerContextCache } from "../core/ticker-context-cache.js";
import { scheduleCompanyDossierRefresh, scheduleInvestorDossierRefresh, slugifyInvestorName } from "../core/dossier-cache.js";
import { invalidateAnalyseModelCache } from "../analyse/build-model.js";
import { isPlausibleTrackedFiler } from "../research/market/tracked-investors-filter.js";
import { parseEventTimeMs, sanitizeEventAtForFeed, FEED_FUTURE_GRACE_DAYS } from "../shared/document-activity-at.js";
import { syncFeedIndexForDocument } from "../shared/feed-index.js";
import { lookupPoliticianCommittee, lookupPoliticianCommittees, formatPoliticianDisplayName } from "../politicians/committees.js";
import { isOlderThanRetentionWindow } from "../shared/ingest-policy.js";

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
    `SELECT id FROM documents WHERE content_sha256 = $1 LIMIT 1`,
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

  const row = await db.one<{ id: string }>(
    `
    INSERT INTO documents (
      queue_id, doc_kind, schema_version, source_key, analysis, event_at,
      feed_kind, feed_label, ticker, ticker_norm, feed_at, program_keys, link_confidence, show_on_ticker,
      url, title, published_at, content_sha256, data
    )
    VALUES (
      $1, $2, 'v1', $3, $4, $5,
      'research', $3, $6, $6, $7::timestamptz, $8, $9, $10,
      $11, $12, $13, $14, $15::jsonb
    )
    RETURNING id
    `,
    [
      args.queueId,
      mapQueueSourceToDocKind(args.sourceType),
      args.out.source_key,
      args.out.analysis,
      eventAt,
      ticker,
      eventAt,
      args.out.program_keys,
      linkConf,
      showOnTicker,
      args.url,
      args.out.title,
      publishedAt,
      args.contentSha256,
      JSON.stringify(slimData),
    ],
  );

  if (row?.id) {
    void syncFeedIndexForDocument(row.id).catch(() => {});
  }

  if (ticker) {
    void invalidateTickerContextCache(ticker);
    invalidateAnalyseModelCache(ticker);
    scheduleCompanyDossierRefresh(ticker, async (tick) => {
      const { buildCompanyDossierPayload } = await import("../research/company-dossier.js");
      return buildCompanyDossierPayload(tick);
    });
  }

  return row?.id ?? null;
}

export async function syncInsiderTransactionsFromDocument(documentId: string, ticker: string, data: any) {
  const t = ticker.trim().toUpperCase();
  const rows = data?.cluster?.worksheet_rows;
  if (!Array.isArray(rows) || !rows.length) return;

  const fallbackAt =
    data?.cluster?.cluster_end_at ??
    data?.cluster?.cluster_start_at ??
    data?.filing?.filed_at ??
    null;

  await db.query(`DELETE FROM insider_transactions WHERE document_id = $1`, [documentId]);

  const names: string[] = [];
  const roles: Array<string | null> = [];
  const codes: Array<string | null> = [];
  const amounts: Array<number | null> = [];
  const ats: string[] = [];
  for (const r of rows) {
    const name = String(r?.insider_name ?? r?.person ?? r?.key ?? "Insider").trim();
    const role = String(r?.key ?? "").trim() || null;
    const code = String(r?.transaction_code ?? r?.code ?? "").trim().toUpperCase() || null;
    const amt = r?.amount_usd != null ? Number(r.amount_usd) : null;
    const at = r?.ts ? String(r.ts) : fallbackAt ? String(fallbackAt) : null;
    if (!at) continue;
    names.push(name);
    roles.push(role);
    codes.push(code);
    amounts.push(Number.isFinite(amt as number) ? (amt as number) : null);
    ats.push(at);
  }

  if (names.length) {
    await db.query(
      `
      INSERT INTO insider_transactions (document_id, ticker, insider_role, insider_name, transaction_code, amount_usd, transaction_at)
      SELECT $1, $2, role, name, code, amount_usd, at::timestamptz
      FROM unnest(
        $3::text[],
        $4::text[],
        $5::text[],
        $6::float8[],
        $7::text[]
      ) AS t(role, name, code, amount_usd, at)
      `,
      [documentId, t, roles, names, codes, amounts, ats],
    );
  }

  void invalidateTickerContextCache(t);

  // Historical drain: skip expensive dossier rebuilds (turn back on after waitlist).
  if (String(process.env.DOSSIER_CACHE_REFRESH_ON_INGEST ?? "1").trim() === "0") return;

  scheduleCompanyDossierRefresh(t, async (tick) => {
    const { buildCompanyDossierPayload } = await import("../research/company-dossier.js");
    return buildCompanyDossierPayload(tick);
  });
  for (const name of names) {
    const slug = slugifyInvestorName(name);
    if (!slug) continue;
    scheduleInvestorDossierRefresh(slug, "insider", async (s, m) => {
      const { buildInvestorDossierPayload } = await import("../investigate/investor-dossier.js");
      return buildInvestorDossierPayload(s, m);
    });
  }
}

export async function syncPoliticianTransactionsFromDocument(documentId: string, ticker: string, data: any) {
  const t = ticker.trim().toUpperCase();
  const rows = data?.cluster?.worksheet_rows;
  if (!Array.isArray(rows) || !rows.length) return;

  const fallbackAt =
    data?.cluster?.cluster_end_at ??
    data?.cluster?.cluster_start_at ??
    data?.filing?.filed_at ??
    null;

  await db.query(`DELETE FROM politician_transactions WHERE document_id = $1`, [documentId]);

  for (const r of rows) {
    const name = String(r?.key ?? "Politician").trim();
    const chamber = r?.chamber ? String(r.chamber).trim() : null;
    const committee =
      (r?.committee != null ? String(r.committee).trim() : "") ||
      (await lookupPoliticianCommittee(name)) ||
      null;
    const txnType = String(r?.transaction_type ?? r?.type ?? "").trim().toUpperCase() || null;
    const amt = r?.amount_usd_mid != null ? Number(r.amount_usd_mid) : null;
    const at = r?.ts ? String(r.ts) : fallbackAt ? String(fallbackAt) : null;
    if (!at) continue;
    await db.query(
      `
      INSERT INTO politician_transactions (document_id, ticker, politician_name, chamber, committee, transaction_type, amount_usd_mid, transaction_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
      `,
      [documentId, t, name, chamber, committee, txnType, Number.isFinite(amt as number) ? amt : null, at],
    );
  }
  void invalidateTickerContextCache(t);
  scheduleCompanyDossierRefresh(t, async (tick) => {
    const { buildCompanyDossierPayload } = await import("../research/company-dossier.js");
    return buildCompanyDossierPayload(tick);
  });
  for (const r of rows) {
    const name = String(r?.key ?? "").trim();
    const slug = slugifyInvestorName(name);
    if (!slug) continue;
    scheduleInvestorDossierRefresh(slug, "politicians", async (s, m) => {
      const { buildInvestorDossierPayload } = await import("../investigate/investor-dossier.js");
      return buildInvestorDossierPayload(s, m);
    });
  }
}

export async function syncInstitutionFilingsFromDocument(documentId: string, ticker: string, data: any) {
  const t = ticker.trim().toUpperCase();
  const rows = data?.cluster?.worksheet_rows;
  if (!Array.isArray(rows) || !rows.length) return;

  const fallbackAt =
    data?.cluster?.cluster_end_at ??
    data?.cluster?.cluster_start_at ??
    data?.filing?.filed_at ??
    null;

  await db.query(`DELETE FROM institution_filings_13f WHERE document_id = $1`, [documentId]);

  for (const r of rows) {
    const filer = String(r?.institution_name ?? r?.key ?? "").trim();
    const activity = String(r?.activity ?? "").trim() || null;
    const amt = r?.amount_usd != null ? Number(r.amount_usd) : null;
    const at = r?.ts ? String(r.ts) : fallbackAt ? String(fallbackAt) : null;
    if (!at) continue;
    if (!isPlausibleTrackedFiler(filer, Number.isFinite(amt as number) ? (amt as number) : null)) continue;
    await db.query(
      `
      INSERT INTO institution_filings_13f (document_id, ticker, filer, activity, amount_usd, filed_at)
      VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
      `,
      [documentId, t, filer, activity, Number.isFinite(amt as number) ? amt : null, at],
    );
  }
  void invalidateTickerContextCache(t);
  scheduleCompanyDossierRefresh(t, async (tick) => {
    const { buildCompanyDossierPayload } = await import("../research/company-dossier.js");
    return buildCompanyDossierPayload(tick);
  });
  for (const r of rows) {
    const filer = String(r?.institution_name ?? r?.key ?? "").trim();
    const slug = slugifyInvestorName(filer);
    if (!slug) continue;
    scheduleInvestorDossierRefresh(slug, "institutions", async (s, m) => {
      const { buildInvestorDossierPayload } = await import("../investigate/investor-dossier.js");
      return buildInvestorDossierPayload(s, m);
    });
  }
}

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

function clusterDocFallbackAt(data: any, eventAt: string | null): string | null {
  return (
    isoTimestampFromDb(eventAt) ??
    isoTimestampFromDb(data?.cluster?.cluster_end_at) ??
    isoTimestampFromDb(data?.cluster?.cluster_start_at) ??
    isoTimestampFromDb(data?.filing?.filed_at) ??
    null
  );
}

async function loadInsiderFlowsFromDocuments(ticker: string, limit = 80) {
  const t = ticker.trim().toUpperCase();
  const docs = await db.query<{ data: any; event_at: string | null; url: string | null }>(
    `
    SELECT data, event_at::text AS event_at, url
    FROM documents
    WHERE ticker_norm = $1 AND feed_kind = 'insider'
    ORDER BY feed_at DESC NULLS LAST, parsed_at DESC
    LIMIT 40
    `,
    [t],
  );
  const out: Array<{
    key: string;
    person: string;
    date: string;
    amount: string;
    transactionCode: string | null;
    url: string | null;
  }> = [];
  for (const d of docs) {
    const fallbackAt = clusterDocFallbackAt(d.data, d.event_at);
    const docUrl = d.url ? String(d.url).trim() : null;
    const rows = Array.isArray(d.data?.cluster?.worksheet_rows) ? d.data.cluster.worksheet_rows : [];
    for (const r of rows) {
      const at = r?.ts ? String(r.ts) : fallbackAt;
      if (!at) continue;
      const amt = r?.amount_usd != null ? Number(r.amount_usd) : null;
      out.push({
        key: String(r?.key ?? r?.insider_role ?? "Insider").trim() || "Insider",
        person: String(r?.insider_name ?? r?.person ?? r?.key ?? "Insider").trim(),
        date: at,
        amount: amt != null && Number.isFinite(amt) && amt > 0 ? formatUsdCompact(amt) : "—",
        transactionCode: r?.transaction_code ?? r?.code ?? null,
        url: docUrl,
      });
    }
  }
  return out.slice(0, limit);
}

async function loadPoliticianFlowsFromDocuments(ticker: string, limit = 80) {
  const t = ticker.trim().toUpperCase();
  const docs = await db.query<{ data: any; event_at: string | null; url: string | null }>(
    `
    SELECT data, event_at::text AS event_at, url
    FROM documents
    WHERE ticker_norm = $1 AND feed_kind = 'politicians'
    ORDER BY feed_at DESC NULLS LAST, parsed_at DESC
    LIMIT 40
    `,
    [t],
  );
  const out: Array<{
    name: string;
    chamber: string;
    committee: string | null;
    date: string;
    amount: string;
    transactionType: string | null;
    url: string | null;
  }> = [];
  for (const d of docs) {
    const fallbackAt = clusterDocFallbackAt(d.data, d.event_at);
    const docUrl = d.url ? String(d.url).trim() : null;
    const rows = Array.isArray(d.data?.cluster?.worksheet_rows) ? d.data.cluster.worksheet_rows : [];
    for (const r of rows) {
      const at = r?.ts ? String(r.ts) : fallbackAt;
      if (!at) continue;
      const amt = r?.amount_usd_mid != null ? Number(r.amount_usd_mid) : null;
      const name = formatPoliticianDisplayName(String(r?.key ?? r?.politician_name ?? "").trim());
      if (!name) continue;
      out.push({
        name,
        chamber: r?.chamber ? String(r.chamber).trim() : "house",
        committee: r?.committee ? String(r.committee).trim() : null,
        date: at,
        amount: amt != null && Number.isFinite(amt) && amt > 0 ? formatUsdCompact(amt) : "—",
        transactionType: r?.transaction_type ?? r?.type ?? null,
        url: docUrl,
      });
    }
  }
  return out.slice(0, limit);
}

async function loadFilings13fFromDocuments(ticker: string, limit = 40) {
  const t = ticker.trim().toUpperCase();
  const docs = await db.query<{ data: any; event_at: string | null; url: string | null }>(
    `
    SELECT data, event_at::text AS event_at, url
    FROM documents
    WHERE ticker_norm = $1 AND feed_kind = 'institutions'
    ORDER BY feed_at DESC NULLS LAST, parsed_at DESC
    LIMIT 40
    `,
    [t],
  );
  const out: Array<{ filer: string; activity: string | null; date: string; amount: string; url: string | null }> = [];
  for (const d of docs) {
    const fallbackAt = clusterDocFallbackAt(d.data, d.event_at);
    const docUrl = d.url ? String(d.url).trim() : null;
    const rows = Array.isArray(d.data?.cluster?.worksheet_rows) ? d.data.cluster.worksheet_rows : [];
    for (const r of rows) {
      const at = r?.ts ? String(r.ts) : fallbackAt;
      if (!at) continue;
      const amt = r?.amount_usd != null ? Number(r.amount_usd) : null;
      const filer = String(r?.institution_name ?? r?.key ?? "").trim();
      if (!isPlausibleTrackedFiler(filer, Number.isFinite(amt as number) ? (amt as number) : null)) continue;
      out.push({
        filer,
        activity: r?.activity ? String(r.activity).trim() : null,
        date: at,
        amount: amt != null && Number.isFinite(amt) && amt > 0 ? formatUsdCompact(amt) : "—",
        url: docUrl,
      });
    }
  }
  return out.slice(0, limit);
}

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
      it.insider_role,
      it.insider_name,
      it.transaction_code,
      it.amount_usd::text,
      it.transaction_at::text,
      d.url
    FROM insider_transactions it
    LEFT JOIN documents d ON d.id = it.document_id
    WHERE it.ticker = $1
    ORDER BY it.transaction_at DESC
    LIMIT $2
    `,
    [t, limit],
  );
  if (!rows.length) return loadInsiderFlowsFromDocuments(t, limit);
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
      pt.politician_name,
      pt.chamber,
      pt.committee,
      pt.transaction_type,
      pt.amount_usd_mid::text,
      pt.transaction_at::text,
      d.url
    FROM politician_transactions pt
    LEFT JOIN documents d ON d.id = pt.document_id
    WHERE pt.ticker = $1
    ORDER BY pt.transaction_at DESC
    LIMIT $2
    `,
    [t, limit],
  );
  if (!rows.length) {
    const fromDocs = await loadPoliticianFlowsFromDocuments(t, limit);
    const committees = await lookupPoliticianCommittees(fromDocs.map((r) => r.name));
    return fromDocs.map((r) => {
      const name = formatPoliticianDisplayName(r.name);
      return {
        ...r,
        name,
        committee: r.committee || committees.get(r.name) || committees.get(name) || null,
      };
    });
  }
  return rows.map((r) => ({
    name: formatPoliticianDisplayName(r.politician_name),
    chamber: r.chamber ?? "house",
    committee: r.committee ?? null,
    date: r.transaction_at,
    amount: r.amount_usd_mid != null && Number(r.amount_usd_mid) > 0 ? formatUsdCompact(Number(r.amount_usd_mid)) : "—",
    transactionType: r.transaction_type,
    url: r.url ? String(r.url).trim() : null,
  }));
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
      f.filer,
      f.activity,
      f.amount_usd::text,
      f.filed_at::text,
      d.url
    FROM institution_filings_13f f
    LEFT JOIN documents d ON d.id = f.document_id
    WHERE f.ticker = $1
    ORDER BY f.filed_at DESC
    LIMIT $2
    `,
    [t, limit],
  );
  if (!rows.length) return loadFilings13fFromDocuments(t, limit);
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
    program_drug: string | null;
    feed_kind: string | null;
    program_phase: string | null;
    data: any;
  }>(
    `
    SELECT id, source_key, event_at::text, url, title, analysis, program_keys, program_drug, feed_kind, program_phase, data
    FROM documents
    WHERE ticker_norm = $1
      AND feed_kind = 'research'
      AND show_on_ticker IS NOT FALSE
      AND (
        (analysis IS NOT NULL AND length(trim(analysis)) > 0)
        OR (title IS NOT NULL AND length(trim(title)) > 0)
      )
    ORDER BY COALESCE(feed_at, event_at) DESC NULLS LAST, parsed_at DESC
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
      program_phase: r.program_phase,
      event_at: r.event_at,
      data: r.data,
    });
    const taggedKeys = Array.isArray(r.program_keys)
      ? r.program_keys.map((k) => String(k ?? "").trim()).filter(Boolean)
      : [];
    const drugKey = String(r.program_drug ?? "").trim();
    const programKeys = taggedKeys.length ? taggedKeys : drugKey ? [drugKey] : [];
    return {
      id: r.id,
      source: String(r.source_key ?? "Other"),
      filedAt: r.event_at ?? new Date().toISOString(),
      url: r.url,
      analysis: String(r.analysis ?? r.title ?? "").trim() || String(r.source_key ?? "Filing"),
      programKeys,
      idea_score: idea.idea_score,
      idea_best: idea.idea_best,
      idea_reasons: idea.idea_reasons,
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
  const rows = await db.query<{ data: unknown; event_at: string | null }>(
    `
    SELECT data, event_at::text
    FROM documents
    WHERE ticker_norm = $1 AND feed_kind = 'institutions'
    ORDER BY feed_at DESC NULLS LAST
    LIMIT $2
    `,
    [t, limit],
  );

  const out: InstitutionShareSnapshot[] = [];
  for (const row of rows) {
    const data = row.data as {
      cluster?: { worksheet_rows?: Array<Record<string, unknown>> };
    } | null;
    const worksheet = data?.cluster?.worksheet_rows;
    if (!Array.isArray(worksheet) || !worksheet.length) continue;

    const filer = String(worksheet[0]?.institution_name ?? worksheet[0]?.key ?? "Institution").trim();
    let shares = 0;
    let anyShares = false;
    for (const r of worksheet) {
      const n = r?.shares != null ? Number(r.shares) : null;
      if (n != null && Number.isFinite(n) && n > 0) {
        shares += n;
        anyShares = true;
      }
    }
    if (!anyShares) continue;

    const rowTs = worksheet
      .map((r) => String(r?.ts ?? "").trim())
      .filter(Boolean)
      .sort()
      .at(-1);
    const asOf = rowTs ?? row.event_at ?? new Date().toISOString();
    out.push({ filer, shares, asOf });
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
    SELECT url, event_at::text, source_key
    FROM documents
    WHERE ticker_norm = $1
      AND feed_kind = 'insider'
      AND source_key IN ('Form 3', 'Form 5')
      AND url IS NOT NULL
    ORDER BY feed_at DESC NULLS LAST
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
