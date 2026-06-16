import { db } from "../core/db.js";
import type { ResearchDocExtractV2 } from "./extract.js";
import { formatUsdCompact } from "../shared/money.js";
import { scoreResearchDocument } from "../core/idea-score.js";

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
  model: string;
  publishedAt: string | null;
}): Promise<string | null> {
  const dup = await db.one<{ id: string }>(
    `SELECT id FROM documents WHERE content_sha256 = $1 LIMIT 1`,
    [args.contentSha256],
  );
  if (dup?.id) return null;

  const ticker = args.out.primary_ticker?.trim().toUpperCase() ?? null;
  const isGov = args.out.source_key === "Gov contract";
  const linkConf = isGov ? args.out.link_confidence : null;
  const showOnTicker = !isGov || (linkConf != null && linkConf >= GOV_LINK_THRESHOLD());

  const row = await db.one<{ id: string }>(
    `
    INSERT INTO documents (
      queue_id, doc_kind, schema_version, source_key, analysis, event_at,
      feed_kind, feed_label, ticker, program_keys, link_confidence, show_on_ticker,
      url, title, published_at, model, prompt_version, content_sha256, data
    )
    VALUES (
      $1, $2, 'v1', $3, $4, $5,
      'research', $3, $6, $7, $8, $9,
      $10, $11, $12, $13, 'research_doc_v2', $14, $15::jsonb
    )
    RETURNING id
    `,
    [
      args.queueId,
      mapQueueSourceToDocKind(args.sourceType),
      args.out.source_key,
      args.out.analysis,
      args.out.event_at ?? args.publishedAt,
      ticker,
      args.out.program_keys,
      linkConf,
      showOnTicker,
      args.url,
      args.out.title,
      args.publishedAt,
      args.model,
      args.contentSha256,
      JSON.stringify(args.out),
    ],
  );

  const docId = row?.id ?? null;
  if (docId && isGov) {
    await upsertGovContractFromDocument(docId, args);
  }

  return docId;
}

async function upsertGovContractFromDocument(
  documentId: string,
  args: {
    contentSha256: string;
    url: string | null;
    out: ResearchDocExtractV2;
    publishedAt: string | null;
  },
) {
  const award = await db.one<{ id: string }>(
    `
    INSERT INTO gov_contract_awards (document_id, award_id, awardee_name, awarded_at, url, summary, data)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    ON CONFLICT (award_id) WHERE award_id IS NOT NULL DO UPDATE SET
      document_id = EXCLUDED.document_id,
      summary = EXCLUDED.summary
    RETURNING id
    `,
    [
      documentId,
      args.contentSha256.slice(0, 64),
      args.out.title,
      args.out.event_at ?? args.publishedAt,
      args.url,
      args.out.analysis.slice(0, 4000),
      JSON.stringify(args.out),
    ],
  );

  const ticker = args.out.primary_ticker?.trim().toUpperCase();
  const conf = args.out.link_confidence;
  if (award?.id && ticker && conf != null && conf >= GOV_LINK_THRESHOLD()) {
    await db.query(
      `
      INSERT INTO gov_contract_ticker_links (award_id, ticker, confidence, reason)
      VALUES ($1, $2, $3, 'llm_explicit')
      ON CONFLICT (award_id, ticker) DO UPDATE SET confidence = EXCLUDED.confidence
      `,
      [award.id, ticker, conf],
    );
  }
}

export async function syncInsiderTransactionsFromDocument(documentId: string, ticker: string, data: any) {
  const t = ticker.trim().toUpperCase();
  const rows = data?.cluster?.worksheet_rows;
  if (!Array.isArray(rows) || !rows.length) return;

  await db.query(`DELETE FROM insider_transactions WHERE document_id = $1`, [documentId]);

  for (const r of rows) {
    const name = String(r?.insider_name ?? r?.person ?? r?.key ?? "Insider").trim();
    const role = String(r?.key ?? "").trim() || null;
    const code = String(r?.transaction_code ?? r?.code ?? "").trim().toUpperCase() || null;
    const amt = r?.amount_usd != null ? Number(r.amount_usd) : null;
    const at = r?.ts ? String(r.ts) : null;
    if (!at) continue;
    await db.query(
      `
      INSERT INTO insider_transactions (document_id, ticker, insider_role, insider_name, transaction_code, amount_usd, transaction_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
      `,
      [documentId, t, role, name, code, Number.isFinite(amt as number) ? amt : null, at],
    );
  }
}

export async function syncPoliticianTransactionsFromDocument(documentId: string, ticker: string, data: any) {
  const t = ticker.trim().toUpperCase();
  const rows = data?.cluster?.worksheet_rows;
  if (!Array.isArray(rows) || !rows.length) return;

  await db.query(`DELETE FROM politician_transactions WHERE document_id = $1`, [documentId]);

  for (const r of rows) {
    const name = String(r?.key ?? "Politician").trim();
    const chamber = r?.chamber ? String(r.chamber).trim() : null;
    const txnType = String(r?.transaction_type ?? r?.type ?? "").trim().toUpperCase() || null;
    const amt = r?.amount_usd_mid != null ? Number(r.amount_usd_mid) : null;
    const at = r?.ts ? String(r.ts) : null;
    if (!at) continue;
    await db.query(
      `
      INSERT INTO politician_transactions (document_id, ticker, politician_name, chamber, transaction_type, amount_usd_mid, transaction_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
      `,
      [documentId, t, name, chamber, txnType, Number.isFinite(amt as number) ? amt : null, at],
    );
  }
}

export async function syncInstitutionFilingsFromDocument(documentId: string, ticker: string, data: any) {
  const t = ticker.trim().toUpperCase();
  const rows = data?.cluster?.worksheet_rows;
  if (!Array.isArray(rows) || !rows.length) return;

  await db.query(`DELETE FROM institution_filings_13f WHERE document_id = $1`, [documentId]);

  for (const r of rows) {
    const filer = String(r?.institution_name ?? r?.key ?? "Institution").trim();
    const activity = String(r?.activity ?? "").trim() || null;
    const amt = r?.amount_usd != null ? Number(r.amount_usd) : null;
    const at = r?.ts ? String(r.ts) : null;
    if (!at) continue;
    await db.query(
      `
      INSERT INTO institution_filings_13f (document_id, ticker, filer, activity, amount_usd, filed_at)
      VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
      `,
      [documentId, t, filer, activity, Number.isFinite(amt as number) ? amt : null, at],
    );
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
  idea_grade?: string;
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
  }>(
    `
    SELECT insider_role, insider_name, transaction_code, amount_usd::text, transaction_at::text
    FROM insider_transactions
    WHERE ticker = $1
    ORDER BY transaction_at DESC
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
  }));
}

export async function loadPoliticianFlowsForTicker(ticker: string, limit = 80) {
  const t = ticker.trim().toUpperCase();
  const rows = await db.query<{
    politician_name: string;
    chamber: string | null;
    transaction_type: string | null;
    amount_usd_mid: string | null;
    transaction_at: string;
  }>(
    `
    SELECT politician_name, chamber, transaction_type, amount_usd_mid::text, transaction_at::text
    FROM politician_transactions
    WHERE ticker = $1
    ORDER BY transaction_at DESC
    LIMIT $2
    `,
    [t, limit],
  );
  return rows.map((r) => ({
    name: r.politician_name,
    chamber: r.chamber ?? "house",
    date: r.transaction_at,
    amount: r.amount_usd_mid != null && Number(r.amount_usd_mid) > 0 ? formatUsdCompact(Number(r.amount_usd_mid)) : "—",
    transactionType: r.transaction_type,
  }));
}

export async function loadFilings13fForTicker(ticker: string, limit = 40) {
  const t = ticker.trim().toUpperCase();
  const rows = await db.query<{
    filer: string;
    activity: string | null;
    amount_usd: string | null;
    filed_at: string;
  }>(
    `
    SELECT filer, activity, amount_usd::text, filed_at::text
    FROM institution_filings_13f
    WHERE ticker = $1
    ORDER BY filed_at DESC
    LIMIT $2
    `,
    [t, limit],
  );
  return rows.map((r) => ({
    filer: r.filer,
    activity: r.activity,
    date: r.filed_at,
    amount: r.amount_usd != null && Number(r.amount_usd) > 0 ? formatUsdCompact(Number(r.amount_usd)) : "—",
  }));
}

export async function loadPaperDocumentsForTicker(ticker: string, limit = 120): Promise<PaperDocumentRow[]> {
  const t = ticker.trim().toUpperCase();
  const rows = await db.query<{
    id: string;
    source_key: string | null;
    event_at: string | null;
    url: string | null;
    analysis: string | null;
    program_keys: string[] | null;
    feed_kind: string | null;
    program_phase: string | null;
    data: any;
  }>(
    `
    SELECT id, source_key, event_at::text, url, analysis, program_keys, feed_kind, program_phase, data
    FROM documents
    WHERE upper(trim(ticker)) = $1
      AND (
        (feed_kind = 'research' AND show_on_ticker IS NOT FALSE AND analysis IS NOT NULL AND length(trim(analysis)) > 0)
        OR (feed_kind = 'pharma' AND source_key = 'ClinicalTrials.gov' AND analysis IS NOT NULL AND length(trim(analysis)) > 0)
      )
    ORDER BY event_at DESC NULLS LAST, parsed_at DESC
    LIMIT $2
    `,
    [t, limit],
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
    return {
      id: r.id,
      source: String(r.source_key ?? "Other"),
      filedAt: r.event_at ?? new Date().toISOString(),
      url: r.url,
      analysis: String(r.analysis ?? ""),
      programKeys: Array.isArray(r.program_keys) ? r.program_keys : [],
      idea_score: idea.idea_score,
      idea_grade: idea.idea_grade,
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
    WHERE ticker = $1 AND feed_kind = 'institutions'
    ORDER BY event_at DESC NULLS LAST
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
    WHERE ticker = $1
      AND feed_kind = 'insider'
      AND source_key IN ('Form 3', 'Form 5')
      AND url IS NOT NULL
    ORDER BY event_at DESC NULLS LAST
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
