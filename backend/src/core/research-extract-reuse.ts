import { db } from "./db.js";
import type { ResearchDocExtractV2 } from "../documents/extract.js";
import {
  REUSE_SIMILARITY_THRESHOLD,
  attachNearDupKey,
  computeResearchNearDupKey,
  textShingleSimilarity,
} from "./research-fingerprint.js";

export {
  attachNearDupKey,
  computeResearchNearDupKey,
  textShingleSimilarity,
} from "./research-fingerprint.js";

type StoredExtractRow = {
  id: string;
  ticker: string | null;
  title: string | null;
  analysis: string | null;
  source_key: string | null;
  event_at: string | null;
  data: (Partial<ResearchDocExtractV2> & { near_dup_key?: string; source_url?: string }) | null;
};

function driversFromData(data: StoredExtractRow["data"]): ResearchDocExtractV2["business_drivers"] | undefined {
  const drivers = data?.business_drivers;
  return Array.isArray(drivers) && drivers.length ? drivers : undefined;
}

/** Build a merge-ready extract from slim jsonb + first-class columns. */
function rowToExtract(row: StoredExtractRow): ResearchDocExtractV2 | null {
  const title = String(row.title ?? row.data?.title ?? "").trim();
  const analysis = String(row.analysis ?? row.data?.analysis ?? "").trim();
  // Legacy full blobs required long analysis; slim rows only need drivers (or valid legacy prose).
  const drivers = driversFromData(row.data);
  const legacyOk = analysis.length >= 40 && title.length >= 8;
  if (!drivers?.length && !legacyOk) return null;

  return {
    schema_type: "research_doc_v2",
    schema_version: "v2",
    title: title || analysis || "Filing",
    primary_ticker: row.ticker?.trim().toUpperCase() ?? row.data?.primary_ticker ?? null,
    source_key: String(row.source_key ?? row.data?.source_key ?? "Other"),
    analysis: analysis || title || "Filing",
    event_at: row.event_at ?? row.data?.event_at ?? null,
    program_keys: Array.isArray(row.data?.program_keys) ? row.data!.program_keys! : [],
    link_confidence: row.data?.link_confidence ?? null,
    ...(row.data?.catalyst_at ? { catalyst_at: row.data.catalyst_at } : {}),
    ...(drivers ? { business_drivers: drivers } : {}),
    ...(row.data?.near_dup_key ? { near_dup_key: row.data.near_dup_key } : {}),
    ...(row.data?.source_url ? { source_url: row.data.source_url } : {}),
  } as ResearchDocExtractV2 & { near_dup_key?: string; source_url?: string };
}

/** Reuse a prior extract when the same story was already parsed (near-dup or similar text). */
export async function findReusableResearchExtract(args: {
  compactText: string;
  ticker?: string | null;
  url: string;
}): Promise<{ out: ResearchDocExtractV2; reused_from: string; near_dup_key: string } | null> {
  const nearDupKey = computeResearchNearDupKey(args.compactText);
  const ticker = args.ticker?.trim().toUpperCase() ?? null;

  const exact = await db.one<{
    id: string;
    ticker: string | null;
    title: string | null;
    analysis: string | null;
    source_key: string | null;
    event_at: string | null;
    data: StoredExtractRow["data"];
  }>(
    `
    SELECT id, ticker, title, analysis, source_key, event_at::text AS event_at, data
    FROM documents
    WHERE feed_kind = 'research'
      AND data->>'near_dup_key' = $1
    ORDER BY parsed_at DESC
    LIMIT 1
    `,
    [nearDupKey],
  );
  if (exact) {
    const out = rowToExtract(exact);
    if (out) {
      return { out, reused_from: exact.id, near_dup_key: nearDupKey };
    }
  }

  if (!ticker) return null;

  const candidates = await db.query<StoredExtractRow>(
    `
    SELECT id, ticker, title, analysis, source_key, event_at::text AS event_at, data
    FROM documents
    WHERE feed_kind = 'research'
      AND ticker_norm = $1
      AND parsed_at >= now() - interval '120 days'
    ORDER BY parsed_at DESC
    LIMIT 40
    `,
    [ticker],
  );

  const threshold = REUSE_SIMILARITY_THRESHOLD();
  for (const row of candidates) {
    const out = rowToExtract(row);
    if (!out) continue;
    const priorKey = row.data?.near_dup_key;
    if (priorKey && priorKey === nearDupKey) {
      return { out, reused_from: row.id, near_dup_key: nearDupKey };
    }
    const priorUrl = row.data?.source_url;
    if (priorUrl && priorUrl === args.url) continue;
    const proxy = `${String(row.title ?? "")}\n${String(row.analysis ?? "")}`;
    const sim = textShingleSimilarity(args.compactText.slice(0, 12_000), proxy);
    if (sim >= threshold) {
      return { out, reused_from: row.id, near_dup_key: nearDupKey };
    }
  }

  return null;
}

/** True when Analyse already has document drivers for this ticker recently — skip LLM. */
export async function tickerHasRecentBusinessDrivers(ticker: string | null | undefined): Promise<boolean> {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) return false;
  const row = await db.one<{ ok: number }>(
    `
    SELECT 1 AS ok
    FROM documents
    WHERE ticker_norm = $1
      AND feed_kind = 'research'
      AND data ? 'business_drivers'
      AND jsonb_typeof(data->'business_drivers') = 'array'
      AND jsonb_array_length(data->'business_drivers') > 0
      AND parsed_at >= now() - interval '180 days'
    LIMIT 1
    `,
    [t],
  );
  return Boolean(row);
}
