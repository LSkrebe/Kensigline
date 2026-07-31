import { sha256NormalizedText } from "../../core/text-hash.js";
import { db } from "../../core/db.js";
import { upsertCompanyNameForTicker } from "../../core/company.js";
import { fetchFilingPrimaryText, fetchSecJson } from "../../core/sec.js";
import {
  runStructuredResearchExtract,
  type ResearchDocExtractV2,
} from "../../documents/extract.js";
import {
  buildTemplateResearchExtract,
  filingTextExcerpt,
  guessSecFormFromFilingText,
  secFilingEventAtFromText,
} from "../../documents/display.js";
import { insertResearchDocument } from "../../documents/store.js";
import { invalidateTickerContextCache } from "../../core/ticker-context-cache.js";
import { compactSecTextForLlm } from "../../core/sec-llm-text.js";
import { compactHttpTextForLlm } from "../../core/http-llm-text.js";
import { prepareLlmText } from "../../core/llm-text-prep.js";
import { LLM_BUDGETS } from "../../core/llm-budgets.js";
import { isBackfillPriority, needsStructuredResearchLlm } from "../../shared/ingest-policy.js";
import { normalizeSourceKey } from "../../shared/source-keys.js";
import { buildParseMeta, logParseOutcome } from "../../shared/parse-meta.js";
import {
  attachNearDupKey,
  computeResearchNearDupKey,
  findReusableResearchExtract,
} from "../../core/research-extract-reuse.js";
import {
  buildGovContractExtractFromFacts,
  parseGovContractFacts,
} from "./gov-contract-parse.js";
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

function httpSourceKey(documentSourceType: string): string {
  if (documentSourceType === "research_transcript_rss") return "Earnings transcript";
  if (documentSourceType === "research_gov_contract") return "Gov contract";
  return "Press release";
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

function pressHeadlineFromText(text: string): string | null {
  const line = String(text ?? "")
    .split(/\n+/)
    .map((s) => s.trim())
    .find((s) => s.length >= 12 && s.length <= 160);
  return line ?? null;
}

function mergeTemplateWithStructured(
  template: ResearchDocExtractV2,
  structured: Partial<ResearchDocExtractV2>,
): ResearchDocExtractV2 {
  const merged: ResearchDocExtractV2 = {
    ...template,
    primary_ticker: structured.primary_ticker ?? template.primary_ticker,
    source_key: structured.source_key ? normalizeSourceKey(structured.source_key, template.source_key) : template.source_key,
    event_at: structured.event_at ?? template.event_at,
    program_keys: structured.program_keys?.length ? structured.program_keys : template.program_keys,
    link_confidence: structured.link_confidence ?? template.link_confidence,
  };
  if (structured.catalyst_at) merged.catalyst_at = structured.catalyst_at;
  if (structured.business_drivers?.length) merged.business_drivers = structured.business_drivers;
  if (template.text_excerpt) merged.text_excerpt = template.text_excerpt;
  return merged;
}

async function finalizePipeline(args: {
  queueId: string;
  documentSourceType: string;
  contentSha: string;
  primaryUrl: string;
  publishedAt: string;
  out: ResearchDocExtractV2;
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

  const ticker = args.out.primary_ticker?.trim().toUpperCase() ?? null;
  if (ticker) void invalidateTickerContextCache(ticker);

  const meta = args.out.parse_meta;
  logParseOutcome({
    source_type: args.documentSourceType,
    queue_id: args.queueId,
    outcome: "parsed",
    path: meta?.path ?? "template",
    llm_used: meta?.llm_used ?? false,
    document_id: docId,
    ticker,
  });

  return { document_id: docId };
}

async function resolveResearchExtract(args: {
  text: string;
  url: string;
  sourceType: string;
  sourceKey: string;
  hintedTicker: string | null;
  hintedName: string | null;
  priority: number;
  secForm?: string | null;
  headline?: string | null;
  prepContext: string;
  compact: (text: string, max: number) => string;
  maxChars: number;
}): Promise<{ out: ResearchDocExtractV2; model: string | null }> {
  const excerpt = filingTextExcerpt(args.text);
  const eventAt =
    args.secForm != null ? secFilingEventAtFromText(args.text) : null;

  const template = buildTemplateResearchExtract({
    sourceKey: args.sourceKey,
    ticker: args.hintedTicker,
    companyName: args.hintedName,
    eventAt,
    url: args.url,
    textExcerpt: excerpt,
    ...(args.headline != null ? { headline: args.headline } : {}),
  });

  const attach = (
    out: ResearchDocExtractV2,
    path: string,
    opts: { llm_used: boolean; llm_ok?: boolean | null; llm_model?: string | null },
  ): ResearchDocExtractV2 => ({
    ...out,
    parse_meta: buildParseMeta({
      path,
      llm_used: opts.llm_used,
      ...(opts.llm_ok !== undefined ? { llm_ok: opts.llm_ok } : {}),
      ...(opts.llm_model !== undefined ? { llm_model: opts.llm_model } : {}),
      source_type: args.sourceType,
    }),
  });

  const useStructured = needsStructuredResearchLlm({
    sourceType: args.sourceType,
    ...(args.secForm != null ? { secForm: args.secForm } : {}),
    priority: args.priority,
  });

  if (!useStructured) {
    return { out: attach(template, "template", { llm_used: false }), model: "template" };
  }

  const prep = prepareLlmText({
    text: args.text,
    context: args.prepContext,
    maxChars: args.maxChars,
    compact: args.compact,
  });

  const reused = await findReusableResearchExtract({
    compactText: prep.text,
    ticker: args.hintedTicker,
    url: args.url,
  });
  if (reused?.out?.business_drivers?.length || reused?.out?.event_at) {
    console.info(
      "[llm-reuse]",
      JSON.stringify({ context: args.prepContext, reused_from: reused.reused_from, near_dup_key: reused.near_dup_key }),
    );
    const merged = mergeTemplateWithStructured(template, reused.out);
    return {
      out: attach(attachNearDupKey(merged, reused.near_dup_key, args.url), "reuse/near-dup", { llm_used: false }),
      model: "reuse/near-dup",
    };
  }

  try {
    const structured = await runStructuredResearchExtract({
      text: prep.text,
      url: args.url,
      sourceType: args.sourceType,
      hintedTicker: args.hintedTicker,
      hintedName: args.hintedName,
    });
    const { model: llmModel, ...structuredFields } = structured;
    const nearDupKey = computeResearchNearDupKey(prep.text);
    const merged = mergeTemplateWithStructured(template, structuredFields);
    return {
      out: attach(attachNearDupKey(merged, nearDupKey, args.url), "research/structured", {
        llm_used: true,
        llm_ok: true,
        llm_model: llmModel,
      }),
      model: "research/structured",
    };
  } catch (e) {
    console.warn("[research/structured] fallback to template", String((e as Error)?.message ?? e));
    return {
      out: attach(template, "template/fallback", { llm_used: true, llm_ok: false }),
      model: "template/fallback",
    };
  }
}

export async function parseNextResearchQueueItem(): Promise<ParseNextResult> {
  const placeholders = RESEARCH_QUEUE_SOURCES.map((_, i) => `$${i + 1}`).join(", ");
  const next = await db.one<{ id: string; url: string; source_type: string; priority: number }>(
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
    RETURNING id, url, source_type, priority
    `,
    [...RESEARCH_QUEUE_SOURCES],
  );
  if (!next) return { processed: false, reason: "no_work" };

  const queueId = next.id;
  const sourceType = next.source_type;
  const priority = Number(next.priority ?? 0);

  try {
    if (isResearchSecSource(sourceType)) {
      return await parseSecDocument(queueId, next.url, priority);
    }
    if (isResearchPressSource(sourceType)) {
      return await parseHttpDocument(queueId, next.url, "research_press_rss", looksPressRelevant, priority);
    }
    if (isResearchTranscriptSource(sourceType)) {
      return await parseHttpDocument(queueId, next.url, "research_transcript_rss", looksTranscriptRelevant, priority);
    }
    if (isResearchGovSource(sourceType)) {
      return await parseHttpDocument(queueId, next.url, "research_gov_contract", looksGovRelevant, priority);
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

async function parseSecDocument(queueId: string, indexUrl: string, priority: number): Promise<ParseNextResult> {
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

  if (
    !isBackfillPriority(priority) &&
    !looksSecResearchRelevant(text.slice(0, 200_000))
  ) {
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
  const secForm = guessSecFormFromFilingText(text);

  if (isBackfillPriority(priority) && !meta.ticker && text.length < 200) {
    await db.query(
      `
      UPDATE document_queue
      SET status = 'dead', last_error = 'skipped_backfill_no_ticker', next_attempt_at = NULL, updated_at = now()
      WHERE id = $1
      `,
      [queueId],
    );
    return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "no_ticker" };
  }

  const { out } = await resolveResearchExtract({
    text,
    url: primaryUrl,
    sourceType: "research_sec",
    sourceKey: secForm,
    hintedTicker: meta.ticker,
    hintedName: meta.name,
    priority,
    secForm,
    prepContext: "research/sec",
    compact: compactSecTextForLlm,
    maxChars: LLM_BUDGETS.secFiling(),
  });

  const publishedAt = new Date().toISOString();
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

  const resolvedTicker = (out.primary_ticker ?? meta.ticker)?.trim().toUpperCase() ?? null;
  if (resolvedTicker && meta.name) {
    await upsertCompanyNameForTicker(resolvedTicker, meta.name).catch(() => {});
  }

  return { processed: true, queue_id: queueId, document_id: fin.document_id };
}

async function parseHttpDocument(
  queueId: string,
  pageUrl: string,
  documentSourceType: "research_press_rss" | "research_transcript_rss" | "research_gov_contract",
  relevance: (text: string) => boolean,
  priority: number,
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
  const sourceKey = httpSourceKey(documentSourceType);
  const httpMode =
    documentSourceType === "research_transcript_rss"
      ? "transcript"
      : documentSourceType === "research_gov_contract"
        ? "gov"
        : "press";

  if (documentSourceType === "research_gov_contract") {
    const facts = parseGovContractFacts(text);
    const deterministic = buildGovContractExtractFromFacts(facts, { url: pageUrl, hintedTicker: guessed });
    if (deterministic) {
      const nearDupKey = computeResearchNearDupKey(text);
      const display = buildTemplateResearchExtract({
        sourceKey: "Gov contract",
        ticker: deterministic.primary_ticker ?? guessed,
        companyName: null,
        eventAt: deterministic.event_at,
        url: pageUrl,
        textExcerpt: filingTextExcerpt(text),
        headline: deterministic.title,
      });
      const publishedAt = new Date().toISOString();
      const govOut = attachNearDupKey(
        mergeTemplateWithStructured(display, { ...deterministic, analysis: display.analysis, title: display.title }),
        nearDupKey,
        pageUrl,
      );
      const fin = await finalizePipeline({
        queueId,
        documentSourceType,
        contentSha,
        primaryUrl: pageUrl,
        publishedAt,
        out: {
          ...govOut,
          parse_meta: buildParseMeta({
            path: "deterministic/gov",
            llm_used: false,
            source_type: documentSourceType,
          }),
        },
      });
      return { processed: true, queue_id: queueId, document_id: fin.document_id };
    }
    await db.query(
      `UPDATE document_queue SET status = 'dead', last_error = 'skipped_gov_parse', next_attempt_at = NULL, updated_at = now() WHERE id = $1`,
      [queueId],
    );
    return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "gov_parse" };
  }

  const maxChars =
    httpMode === "transcript"
      ? LLM_BUDGETS.transcript()
      : LLM_BUDGETS.pressRelease();

  const { out } = await resolveResearchExtract({
    text,
    url: pageUrl,
    sourceType: documentSourceType,
    sourceKey,
    hintedTicker: guessed,
    hintedName: null,
    priority,
    headline: documentSourceType === "research_press_rss" ? pressHeadlineFromText(text) : null,
    prepContext: `research/${httpMode}`,
    compact: (body, max) => compactHttpTextForLlm(body, httpMode, max),
    maxChars,
  });

  const publishedAt = new Date().toISOString();
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
