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
  data: ResearchDocExtractV2 & { near_dup_key?: string; source_url?: string };
};

function isValidStoredExtract(data: unknown): data is ResearchDocExtractV2 {
  const d = data as ResearchDocExtractV2;
  return (
    d?.schema_type === "research_doc_v2" &&
    typeof d.analysis === "string" &&
    d.analysis.trim().length >= 40 &&
    typeof d.title === "string" &&
    d.title.trim().length >= 8
  );
}

/** Reuse a prior LLM extract when the same story was already parsed from another mirror URL. */
export async function findReusableResearchExtract(args: {
  compactText: string;
  ticker?: string | null;
  url: string;
}): Promise<{ out: ResearchDocExtractV2; reused_from: string; near_dup_key: string } | null> {
  const nearDupKey = computeResearchNearDupKey(args.compactText);
  const ticker = args.ticker?.trim().toUpperCase() ?? null;

  const exact = await db.one<{ id: string; data: unknown }>(
    `
    SELECT id, data
    FROM documents
    WHERE feed_kind = 'research'
      AND data->>'near_dup_key' = $1
    ORDER BY parsed_at DESC
    LIMIT 1
    `,
    [nearDupKey],
  );
  if (exact?.data && isValidStoredExtract(exact.data)) {
    return {
      out: { ...(exact.data as ResearchDocExtractV2), schema_type: "research_doc_v2", schema_version: "v2" },
      reused_from: exact.id,
      near_dup_key: nearDupKey,
    };
  }

  const candidates = await db.query<StoredExtractRow>(
    `
    SELECT id, ticker, data
    FROM documents
    WHERE feed_kind = 'research'
      AND parsed_at >= now() - interval '120 days'
      AND ($1::text IS NULL OR upper(trim(ticker)) = $1)
    ORDER BY parsed_at DESC
    LIMIT 40
    `,
    [ticker],
  );

  const threshold = REUSE_SIMILARITY_THRESHOLD();
  for (const row of candidates) {
    if (!isValidStoredExtract(row.data)) continue;
    const priorKey = row.data.near_dup_key;
    if (priorKey && priorKey === nearDupKey) {
      return { out: row.data, reused_from: row.id, near_dup_key: nearDupKey };
    }
    const priorUrl = row.data.source_url;
    if (priorUrl && priorUrl === args.url) continue;
    const proxy = `${row.data.title}\n${row.data.analysis}`;
    const sim = textShingleSimilarity(args.compactText.slice(0, 12_000), proxy);
    if (sim >= threshold) {
      return { out: row.data, reused_from: row.id, near_dup_key: nearDupKey };
    }
  }

  return null;
}
