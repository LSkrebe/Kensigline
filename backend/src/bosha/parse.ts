import { createHash } from "node:crypto";
import { db } from "../core/db.js";
import { fetchFilingPrimaryText, fetchSecJson } from "../core/sec.js";
import { runMiroSharkExtract } from "./miroshark.js";
import { insertBoshaDocument, persistMiroSharkExtraction, resolveSubjectTicker } from "./store.js";
import { computeScoreForTicker, saveTickerState } from "./score.js";
import { maybeEmitPaper } from "./paper.js";
import { fetchArticleHtml, guessTickerFromText, stripHtmlToText } from "./feeds.js";
import { isUrlAllowedForBoshaHttpIngest } from "./engine-spec.js";

type ParseNextResult =
  | { processed: false; reason: "no_work" }
  | { processed: false; reason: "skipped"; queue_id: string; skip_reason: string }
  | { processed: true; queue_id: string; document_id: string | null };

const BOSHA_QUEUE_SOURCES = ["bosha_sec", "bosha_press_rss", "bosha_transcript_rss"] as const;

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

function looksSecBoshaRelevant(text: string) {
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
  title: string | null;
  publishedAt: string;
  subjectTicker: string | null;
  model: string;
  out: Awaited<ReturnType<typeof runMiroSharkExtract>>["out"];
}): Promise<{ document_id: string | null }> {
  const { queueId, documentSourceType, contentSha, primaryUrl, title, publishedAt, subjectTicker, model, out } = args;

  const docId = await insertBoshaDocument({
    queueId,
    contentSha256: contentSha,
    sourceType: documentSourceType,
    url: primaryUrl,
    title,
    publishedAt,
    primaryTicker: subjectTicker,
    model,
  });

  if (!docId) {
    await db.query(`UPDATE document_queue SET status = 'parsed', updated_at = now() WHERE id = $1`, [queueId]);
    return { document_id: null };
  }

  const { tickersTouched } = await persistMiroSharkExtraction({
    documentId: docId,
    out,
    publishedAt,
  });

  await db.query(`UPDATE document_queue SET status = 'parsed', updated_at = now(), last_error = NULL WHERE id = $1`, [
    queueId,
  ]);

  const uniq = Array.from(
    new Set(
      [...tickersTouched, subjectTicker].filter(Boolean).map((x) => String(x).trim().toUpperCase()),
    ),
  );
  for (const t of uniq) {
    const { score, components } = await computeScoreForTicker(t);
    await saveTickerState(t, score, components);
    await maybeEmitPaper(t, score);
  }

  return { document_id: docId };
}

export async function parseNextBoshaQueueItem(): Promise<ParseNextResult> {
  const placeholders = BOSHA_QUEUE_SOURCES.map((_, i) => `$${i + 1}`).join(", ");
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
    [...BOSHA_QUEUE_SOURCES],
  );
  if (!next) return { processed: false, reason: "no_work" };

  const queueId = next.id;
  const sourceType = next.source_type;

  try {
    if (sourceType === "bosha_sec") {
      return await parseSecDocument(queueId, next.url);
    }
    if (sourceType === "bosha_press_rss") {
      return await parseHttpDocument(queueId, next.url, "bosha_press_rss", looksPressRelevant);
    }
    if (sourceType === "bosha_transcript_rss") {
      return await parseHttpDocument(queueId, next.url, "bosha_transcript_rss", looksTranscriptRelevant);
    }
    await db.query(`UPDATE document_queue SET status = 'dead', last_error = 'unknown_bosha_source', updated_at = now() WHERE id = $1`, [
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
  const contentSha = createHash("sha256").update(text, "utf8").digest("hex");

  const existingDoc = await db.one<{ id: string }>(
    `SELECT id FROM bosha_documents WHERE content_sha256 = $1 LIMIT 1`,
    [contentSha],
  );
  if (existingDoc?.id) {
    await db.query(
      `UPDATE document_queue SET status = 'parsed', updated_at = now(), last_error = 'duplicate_bosha_sha' WHERE id = $1`,
      [queueId],
    );
    return { processed: true, queue_id: queueId, document_id: null };
  }

  if (!looksSecBoshaRelevant(text.slice(0, 200_000))) {
    await db.query(
      `
      UPDATE document_queue
      SET status = 'dead', last_error = 'skipped_bosha_low_signal', next_attempt_at = NULL, updated_at = now()
      WHERE id = $1
      `,
      [queueId],
    );
    return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "low_signal" };
  }

  const cik = cikFromIndexUrl(indexUrl);
  const meta = cik ? await metaFromCik(cik) : { ticker: null, name: null };

  const { out, model } = await runMiroSharkExtract({
    text: text.slice(0, 100_000),
    url: primaryUrl,
    hintedTicker: meta.ticker,
    hintedName: meta.name,
  });

  const subject = resolveSubjectTicker(out) ?? meta.ticker;
  const publishedAt = new Date().toISOString();

  const fin = await finalizePipeline({
    queueId,
    documentSourceType: "bosha_sec",
    contentSha,
    primaryUrl,
    title: out.title ?? null,
    publishedAt,
    subjectTicker: subject,
    model,
    out,
  });

  return { processed: true, queue_id: queueId, document_id: fin.document_id };
}

async function parseHttpDocument(
  queueId: string,
  pageUrl: string,
  documentSourceType: "bosha_press_rss" | "bosha_transcript_rss",
  relevance: (text: string) => boolean,
): Promise<ParseNextResult> {
  if (!isUrlAllowedForBoshaHttpIngest(pageUrl)) {
    await db.query(
      `
      UPDATE document_queue
      SET status = 'dead', last_error = 'bosha_disallowed_http_host', next_attempt_at = NULL, updated_at = now()
      WHERE id = $1
      `,
      [queueId],
    );
    return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "disallowed_host" };
  }

  const html = await fetchArticleHtml(pageUrl);
  const text = stripHtmlToText(html);
  const contentSha = createHash("sha256").update(text, "utf8").digest("hex");

  const existingDoc = await db.one<{ id: string }>(
    `SELECT id FROM bosha_documents WHERE content_sha256 = $1 LIMIT 1`,
    [contentSha],
  );
  if (existingDoc?.id) {
    await db.query(
      `UPDATE document_queue SET status = 'parsed', updated_at = now(), last_error = 'duplicate_bosha_sha' WHERE id = $1`,
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
  const { out, model } = await runMiroSharkExtract({
    text: text.slice(0, 100_000),
    url: pageUrl,
    hintedTicker: guessed,
    hintedName: null,
  });

  const subject = resolveSubjectTicker(out) ?? guessed;
  const publishedAt = new Date().toISOString();

  const fin = await finalizePipeline({
    queueId,
    documentSourceType,
    contentSha,
    primaryUrl: pageUrl,
    title: out.title ?? null,
    publishedAt,
    subjectTicker: subject,
    model,
    out,
  });

  return { processed: true, queue_id: queueId, document_id: fin.document_id };
}
