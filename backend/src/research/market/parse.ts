import { sha256NormalizedText } from "../../core/text-hash.js";
import { db } from "../../core/db.js";
import { fetchFilingPrimaryText, fetchSecJson } from "../../core/sec.js";
import { runResearchDocExtract } from "../../documents/extract.js";
import { insertResearchDocument } from "../../documents/store.js";
import { compactSecTextForLlm } from "../../core/sec-llm-text.js";
import { compactHttpTextForLlm } from "../../core/http-llm-text.js";
import { fetchArticleHtml, guessTickerFromText, stripHtmlToText } from "./feeds.js";
import { isUrlAllowedForResearchHttpIngest, RESEARCH_QUEUE_SOURCE_TYPES } from "../../documents/spec.js";

type ParseNextResult =
  | { processed: false; reason: "no_work" }
  | { processed: false; reason: "skipped"; queue_id: string; skip_reason: string }
  | { processed: true; queue_id: string; document_id: string | null };

const RESEARCH_QUEUE_SOURCES = RESEARCH_QUEUE_SOURCE_TYPES;

function cikFromIndexUrl(indexUrl: string) {
  const m = String(indexUrl ?? "").match(/\/Archives\/edgar\/data\/(\d+)\//i);
  if (!m) return null;
  return String(m[1]).padStart(10, "0");
}

async function metaFromCik(cik10: string): Promise<{ ticker: string | null; name: string | null }> {
  try {
    const subs = (await fetchSecJson(`https://data.sec.gov/submissions/CIK${cik10}.json`)) as any;
    const tickers = Array.isArray(subs?.tickers) ? subs.tickers : [];
    const ticker = tickers.length ? String(tickers[0]).trim().toUpperCase() : null;
    const name = subs?.name ? String(subs.name) : null;
    return { ticker, name };
  } catch {
    return { ticker: null, name: null };
  }
}

function isResearchSecSource(sourceType: string) {
  return sourceType === "research_sec" || sourceType === "bosha_sec";
}
function isResearchPressSource(sourceType: string) {
  return sourceType === "research_press_rss" || sourceType === "bosha_press_rss";
}
function isResearchTranscriptSource(sourceType: string) {
  return sourceType === "research_transcript_rss" || sourceType === "bosha_transcript_rss";
}

function isResearchGovSource(sourceType: string) {
  return sourceType === "research_gov_contract" || sourceType === "bosha_gov_contract";
}

function normalizeDocumentSourceType(
  sourceType: string,
): "research_sec" | "research_press_rss" | "research_transcript_rss" | "research_gov_contract" {
  if (isResearchPressSource(sourceType)) return "research_press_rss";
  if (isResearchTranscriptSource(sourceType)) return "research_transcript_rss";
  if (isResearchGovSource(sourceType)) return "research_gov_contract";
  return "research_sec";
}
function looksSecResearchRelevant(text: string) {
  const t = text.toLowerCase();
  return (
    t.length > 400 &&
    (t.includes("exhibit") ||
      t.includes("agreement") ||
      t.includes("financial") ||
      t.includes("press") ||
      t.includes("acquisition") ||
      t.includes("merger") ||
      t.includes("revenue") ||
      t.includes("item 1.01") ||
      t.includes("item 2.02") ||
      t.includes("item 8.01") ||
      t.includes("partnership") ||
      t.includes("collaboration"))
  );
}

function looksPressRelevant(text: string) {
  const t = text.toLowerCase();
  return (
    t.length > 350 &&
    (t.includes("earnings") ||
      t.includes("revenue") ||
      t.includes("guidance") ||
      t.includes("announces") ||
      t.includes("acquisition") ||
      t.includes("merger") ||
      t.includes("partnership") ||
      t.includes("collaboration") ||
      t.includes("contract") ||
      t.includes("fda") ||
      t.includes("clinical") ||
      t.includes("financ"))
  );
}

function looksGovRelevant(text: string) {
  const t = text.toLowerCase();
  return (
    t.length > 200 &&
    (t.includes("contract") ||
      t.includes("award") ||
      t.includes("sam.gov") ||
      t.includes("federal") ||
      t.includes("gsa") ||
      t.includes("obligated") ||
      t.includes("agency"))
  );
}

function looksTranscriptRelevant(text: string) {
  const t = text.toLowerCase();
  return (
    t.length > 900 &&
    (t.includes("transcript") ||
      t.includes("conference call") ||
      t.includes("earnings call") ||
      t.includes("operator") ||
      t.includes("question-and-answer") ||
      t.includes("questions and answers") ||
      (t.includes("forward-looking") && t.includes("call")))
  );
}

async function finalizePipeline(args: {
  queueId: string;
  documentSourceType: string;
  contentSha: string;
  primaryUrl: string;
  publishedAt: string;
  out: Awaited<ReturnType<typeof runResearchDocExtract>>["out"];
}): Promise<{ document_id: string | null }> {
  const docId = await insertResearchDocument({
    queueId: args.queueId,
    contentSha256: args.contentSha,
    sourceType: args.documentSourceType,
    url: args.primaryUrl,
    out: args.out,
    publishedAt: args.publishedAt,
  });

  await db.query(`UPDATE document_queue SET status = 'parsed', updated_at = now(), last_error = NULL WHERE id = $1`, [
    args.queueId,
  ]);

  return { document_id: docId };
}

export async function parseNextResearchQueueItem(): Promise<ParseNextResult> {
  const placeholders = RESEARCH_QUEUE_SOURCES.map((_, i) => `$${i + 1}`).join(", ");
  const next = await db.one<{ id: string; url: string; source_type: string }>(
    `
    UPDATE document_queue
    SET status = 'parsing', updated_at = now()
    WHERE id = (
      SELECT id
      FROM document_queue
      WHERE status IN ('ready_to_parse', 'queued', 'failed')
        AND source_type IN (${placeholders})
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, url, source_type
    `,
    [...RESEARCH_QUEUE_SOURCES],
  );
  if (!next) return { processed: false, reason: "no_work" };

  const queueId = next.id;
  const sourceType = next.source_type;

  try {
    if (isResearchSecSource(sourceType)) {
      return await parseSecDocument(queueId, next.url);
    }
    if (isResearchPressSource(sourceType)) {
      return await parseHttpDocument(queueId, next.url, "research_press_rss", looksPressRelevant);
    }
    if (isResearchTranscriptSource(sourceType)) {
      return await parseHttpDocument(queueId, next.url, "research_transcript_rss", looksTranscriptRelevant);
    }
    if (isResearchGovSource(sourceType)) {
      return await parseHttpDocument(queueId, next.url, "research_gov_contract", looksGovRelevant);
    }
    await db.query(`UPDATE document_queue SET status = 'dead', last_error = 'unknown_research_source', updated_at = now() WHERE id = $1`, [
      queueId,
    ]);
    return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "unknown_source" };
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const attempts = await db.one<{ attempts: number }>(
      `UPDATE document_queue SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
      [queueId],
    );
    const n = attempts?.attempts ?? 1;
    const backoffMinutes = Math.min(60, 2 ** Math.min(5, n));
    const status = n >= 6 ? "dead" : "failed";
    await db.query(
      `
      UPDATE document_queue
      SET status = $2, last_error = $3, next_attempt_at = now() + ($4 || ' minutes')::interval, updated_at = now()
      WHERE id = $1
      `,
      [queueId, status, msg.slice(0, 2000), String(backoffMinutes)],
    );
    return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "error" };
  }
}

async function parseSecDocument(queueId: string, indexUrl: string): Promise<ParseNextResult> {
  const { url: primaryUrl, text } = await fetchFilingPrimaryText(indexUrl);
  const contentSha = sha256NormalizedText(text);

  const existingDoc = await db.one<{ id: string }>(`SELECT id FROM documents WHERE content_sha256 = $1 LIMIT 1`, [contentSha]);
  if (existingDoc?.id) {
    await db.query(
      `UPDATE document_queue SET status = 'parsed', updated_at = now(), last_error = 'duplicate_sha' WHERE id = $1`,
      [queueId],
    );
    return { processed: true, queue_id: queueId, document_id: null };
  }

  if (!looksSecResearchRelevant(text.slice(0, 200_000))) {
    await db.query(
      `
      UPDATE document_queue
      SET status = 'dead', last_error = 'skipped_low_signal', next_attempt_at = NULL, updated_at = now()
      WHERE id = $1
      `,
      [queueId],
    );
    return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "low_signal" };
  }

  const cik = cikFromIndexUrl(indexUrl);
  const meta = cik ? await metaFromCik(cik) : { ticker: null, name: null };

  const { out } = await runResearchDocExtract({
    text: compactSecTextForLlm(text, 100_000),
    url: primaryUrl,
    sourceType: "research_sec",
    hintedTicker: meta.ticker,
    hintedName: meta.name,
  });

  const publishedAt = out.event_at ?? new Date().toISOString();
  const fin = await finalizePipeline({
    queueId,
    documentSourceType: "research_sec",
    contentSha,
    primaryUrl,
    publishedAt,
    out: {
      ...out,
      primary_ticker: out.primary_ticker ?? meta.ticker,
    },
  });

  return { processed: true, queue_id: queueId, document_id: fin.document_id };
}

async function parseHttpDocument(
  queueId: string,
  pageUrl: string,
  documentSourceType: "research_press_rss" | "research_transcript_rss" | "research_gov_contract",
  relevance: (text: string) => boolean,
): Promise<ParseNextResult> {
  if (!isUrlAllowedForResearchHttpIngest(pageUrl)) {
    await db.query(
      `
      UPDATE document_queue
      SET status = 'dead', last_error = 'disallowed_http_host', next_attempt_at = NULL, updated_at = now()
      WHERE id = $1
      `,
      [queueId],
    );
    return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "disallowed_host" };
  }

  const html = await fetchArticleHtml(pageUrl);
  const text = stripHtmlToText(html);
  const contentSha = sha256NormalizedText(text);

  const existingDoc = await db.one<{ id: string }>(`SELECT id FROM documents WHERE content_sha256 = $1 LIMIT 1`, [contentSha]);
  if (existingDoc?.id) {
    await db.query(
      `UPDATE document_queue SET status = 'parsed', updated_at = now(), last_error = 'duplicate_sha' WHERE id = $1`,
      [queueId],
    );
    return { processed: true, queue_id: queueId, document_id: null };
  }

  if (!relevance(text)) {
    await db.query(
      `
      UPDATE document_queue
      SET status = 'dead', last_error = 'skipped_http_low_signal', next_attempt_at = NULL, updated_at = now()
      WHERE id = $1
      `,
      [queueId],
    );
    return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "low_signal" };
  }

  const guessed = guessTickerFromText(null, text.slice(0, 4000));
  const httpMode =
    documentSourceType === "research_transcript_rss"
      ? "transcript"
      : documentSourceType === "research_gov_contract"
        ? "gov"
        : "press";
  const { out } = await runResearchDocExtract({
    text: compactHttpTextForLlm(text, httpMode, 100_000),
    url: pageUrl,
    sourceType: documentSourceType,
    hintedTicker: guessed,
    hintedName: null,
  });

  const publishedAt = out.event_at ?? new Date().toISOString();
  const fin = await finalizePipeline({
    queueId,
    documentSourceType,
    contentSha,
    primaryUrl: pageUrl,
    publishedAt,
    out: {
      ...out,
      primary_ticker: out.primary_ticker ?? guessed,
    },
  });

  return { processed: true, queue_id: queueId, document_id: fin.document_id };
}
