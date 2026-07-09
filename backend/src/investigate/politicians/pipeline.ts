import { db } from "../../core/db.js";
import {
  fetchSenatePtrHtml,
  openSenateSession,
  parseSenatePtrHtml,
  type ParsedSenatePtr,
} from "../../core/senate.js";
import { syncPoliticianTransactionsFromDocument } from "../../documents/store.js";
import { syncFeedIndexForDocument } from "../../shared/feed-index.js";
import { createHash } from "node:crypto";
import { extractPdfTextWithFallback } from "../../core/pdf.js";
import { createRequire } from "node:module";
import {
  MIN_HOUSE_PTR_CONFIDENT_ROWS,
  parseHousePtrPdfText,
} from "./house-ptr-parse.js";
import { getSecTickerTitleMap } from "../../core/sec.js";

type PoliticianPtrSource = "house_ptr" | "senate_ptr";
type Chamber = "house" | "senate";

type ParseNextResult =
  | { processed: false; reason: "no_work" }
  | { processed: false; reason: "busy"; queue_id: string }
  | { processed: false; reason: "skipped"; queue_id: string; skip_reason: string }
  | { processed: true; queue_id: string; parsed_ids: string[]; ticker_count: number };

type PoliticianTxn = {
  owner: string | null;
  asset_name: string | null;
  ticker: string | null;
  asset_type: string | null;
  transaction_type: string | null;
  transaction_date: string | null;
  notification_date: string | null;
  amount_range: string | null;
  description: string | null;
};

type PoliticianFiling = {
  filer: { name: string | null; office: string | null; state_district: string | null };
  filing_id: string | null;
  filed_at: string | null;
  source: PoliticianPtrSource;
  pdf_url: string | null;
  transactions: PoliticianTxn[];
  context_sentences: string[];
};

function extractJsonObject(text: string): any {
  const require = createRequire(import.meta.url);
  let raw = String(text ?? "").trim();
  if (!raw) throw new Error("empty_llm_response");
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sub = raw.slice(start, end + 1);
      try {
        return JSON.parse(sub);
      } catch {
        const { jsonrepair } = require("jsonrepair");
        const repaired = String(jsonrepair(sub)).replace(/\u0000/g, "");
        return JSON.parse(repaired);
      }
    }
    throw new Error("llm_output_not_json");
  }
}

function formatIso(ts: any): string | null {
  const d = new Date(String(ts ?? ""));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseUsdAmountRange(s: string | null): { low: number | null; high: number | null; mid: number | null; raw: string | null } {
  const raw = s ? String(s).trim() : null;
  if (!raw) return { low: null, high: null, mid: null, raw: null };
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const m = cleaned.match(/\$([\d,]+(?:\.\d+)?)\s*-\s*\$?([\d,]+(?:\.\d+)?)/);
  if (!m) return { low: null, high: null, mid: null, raw: cleaned };
  const low = Number(String(m[1]).replace(/,/g, ""));
  const high = Number(String(m[2]).replace(/,/g, ""));
  const lo = Number.isFinite(low) ? low : null;
  const hi = Number.isFinite(high) ? high : null;
  const mid = lo != null && hi != null ? (lo + hi) / 2 : null;
  return { low: lo, high: hi, mid, raw: cleaned };
}

function isPoliticianSchema(out: any, source: PoliticianPtrSource): out is {
  schema_type: "politician_filing";
  schema_version: "v1";
  filer: { name: string | null; office: string | null; state_district: string | null };
  filing: { filing_id: string | null; filed_at: string | null; source: PoliticianPtrSource; pdf_url: string | null };
  transactions: PoliticianTxn[];
  context_sentences: string[];
} {
  return (
    out &&
    typeof out === "object" &&
    out.schema_type === "politician_filing" &&
    out.schema_version &&
    Array.isArray(out.transactions) &&
    Array.isArray(out.context_sentences) &&
    String(out?.filing?.source ?? source) === source
  );
}

async function fetchPdfBytes(url: string): Promise<Buffer> {
  const r = await fetch(url, {
    headers: { "user-agent": "kensigline/0.1 (+politicians-ptr)" },
  });
  if (!r.ok) throw new Error(`ptr_pdf_fetch_failed_${r.status}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

const PTR_REPORTABLE_TYPES = new Set(["P", "S", "E"]);

/** Stock rows for P/S/E — matches Investigate PTR transaction filters in the UI. */
function filterReportableStockTransactions(txAll: PoliticianTxn[]) {
  return txAll.filter((t) => {
    const type = String(t?.transaction_type ?? "").trim().toUpperCase();
    if (!PTR_REPORTABLE_TYPES.has(type)) return false;
    const at = String(t?.asset_type ?? "").trim().toUpperCase();
    return !at || at.includes("ST") || /\bCOMMON STOCK\b/i.test(String(t?.asset_name ?? ""));
  });
}

function filingFromParsed(parsed: PoliticianFiling): PoliticianFiling {
  return parsed;
}

function filingFromSenate(parsed: ParsedSenatePtr, viewUrl: string): PoliticianFiling {
  return {
    filer: parsed.filer,
    filing_id: parsed.filing_id,
    filed_at: parsed.filed_at,
    source: "senate_ptr",
    pdf_url: viewUrl,
    transactions: parsed.transactions,
    context_sentences: parsed.context_sentences,
  };
}

async function loadHouseFiling(url: string): Promise<{ filing: PoliticianFiling; contentSha256: string; model: string | null }> {
  const pdf = await fetchPdfBytes(url);
  const contentSha256 = createHash("sha256").update(pdf).digest("hex");
  const filingId = (url.match(/\/(\d+)\.pdf$/i) ?? [])[1] ?? null;
  const { text: pdfText } = await extractPdfTextWithFallback(pdf);

  const parsed = parseHousePtrPdfText(pdfText, url);
  if (parsed.confident_rows >= MIN_HOUSE_PTR_CONFIDENT_ROWS || parsed.transactions.length) {
    return {
      contentSha256,
      model: null,
      filing: {
        filer: parsed.filer,
        filing_id: parsed.filing_id ?? filingId,
        filed_at: parsed.filed_at,
        source: "house_ptr",
        pdf_url: url,
        transactions: parsed.transactions,
        context_sentences: parsed.context_sentences,
      },
    };
  }

  throw new Error("house_ptr_low_confidence_parse");
}

async function loadSenateFiling(url: string): Promise<{ filing: PoliticianFiling; contentSha256: string; model: string | null }> {
  const session = await openSenateSession();
  const html = await fetchSenatePtrHtml(url, session);
  const contentSha256 = createHash("sha256").update(html).digest("hex");
  const parsed = parseSenatePtrHtml(html, url);
  return { contentSha256, model: null, filing: filingFromSenate(parsed, url) };
}

async function persistPoliticianFiling(opts: {
  queueId: string;
  url: string;
  chamber: Chamber;
  source: PoliticianPtrSource;
  promptVersion: string;
  model: string | null;
  contentSha256: string;
  filing: PoliticianFiling;
}): Promise<string[]> {
  const { queueId, url, chamber, source, promptVersion, model, contentSha256, filing } = opts;
  const txP = filterReportableStockTransactions(filing.transactions);
  if (!txP.length) return [];

  const secTitles = await getSecTickerTitleMap();
  const byTicker = new Map<string, PoliticianTxn[]>();
  for (const t of txP) {
    const ticker = String(t?.ticker ?? "").trim().toUpperCase();
    if (!ticker) continue;
    // Guard against bad parses: only persist tickers that exist in SEC's mapping.
    if (!secTitles.has(ticker)) continue;
    const arr = byTicker.get(ticker) ?? [];
    arr.push(t);
    byTicker.set(ticker, arr);
  }
  if (!byTicker.size) return [];

  const parsedIds: string[] = [];
  const filerName = String(filing.filer?.name ?? "").trim() || "POLITICIAN";

  for (const [ticker, txs] of byTicker.entries()) {
    const docSha = `${contentSha256}:${ticker}`;
    txs.sort((a, b) => String(b?.notification_date ?? "").localeCompare(String(a?.notification_date ?? "")));

    const filingAt = formatIso(filing.filed_at);
    const worksheet_rows = txs.map((t) => {
      const amt = parseUsdAmountRange(t?.amount_range ?? null);
      return {
        key: filerName,
        chamber,
        ts: formatIso(t?.transaction_date) ?? formatIso(t?.notification_date) ?? filingAt,
        reported_at: formatIso(t?.notification_date),
        transaction_type: t?.transaction_type ?? null,
        owner: t?.owner ?? null,
        amount_range: amt.raw,
        amount_usd_mid: amt.mid,
        amount_usd_low: amt.low,
        amount_usd_high: amt.high,
        asset_name: t?.asset_name ?? null,
        ticker,
        description: t?.description ?? null,
      };
    });

    const sumMid = worksheet_rows.reduce((a: number, r: any) => a + (Number(r?.amount_usd_mid ?? 0) || 0), 0);
    const feedLabel = sumMid > 0 ? `${Math.round(sumMid)} (${worksheet_rows.length})` : `(${worksheet_rows.length})`;
    const feedAt =
      formatIso(txs[0]?.notification_date) ??
      formatIso(txs[0]?.transaction_date) ??
      formatIso(filing.filed_at) ??
      new Date().toISOString();

    const data = {
      schema_type: "politician_cluster",
      schema_version: "v1",
      issuer: { name: null, ticker, cik: null },
      filing: {
        form_type: "PTR",
        accession_no: filing.filing_id,
        filed_at: formatIso(filing.filed_at) ?? feedAt,
        source,
        pdf_url: url,
        chamber,
      },
      cluster: {
        feed_label: feedLabel,
        cluster_start_at: worksheet_rows.at(-1)?.ts ?? null,
        cluster_end_at: worksheet_rows[0]?.ts ?? null,
        politicians: [filerName],
        context_sentences: Array.isArray(filing.context_sentences)
          ? filing.context_sentences.map((s) => String(s)).filter(Boolean).slice(0, 3)
          : [],
        worksheet_rows,
      },
    };

    const inserted = await db.one<{ id: string }>(
      `
      INSERT INTO documents (
        queue_id, doc_kind, schema_version, ticker, feed_kind, source_key, event_at,
        feed_label, url, published_at, content_sha256, data
      )
      VALUES ($1, $2, $3, $4, 'politicians', 'PTR', $5, $6, $7, $8, $9, $10)
      ON CONFLICT (content_sha256) WHERE content_sha256 IS NOT NULL
      DO UPDATE SET parsed_at = now()
      RETURNING id
      `,
      [
        queueId,
        "politician_cluster",
        "v1",
        ticker,
        feedAt,
        feedLabel,
        url,
        feedAt,
        docSha,
        data,
      ],
    );
    if (inserted?.id) {
      parsedIds.push(inserted.id);
      await syncPoliticianTransactionsFromDocument(inserted.id, ticker, data);
      void syncFeedIndexForDocument(inserted.id).catch(() => {});
    }
  }

  return parsedIds;
}

export async function parseNextPoliticiansQueueItem(): Promise<ParseNextResult> {
  const next = await db.one<{ id: string; url: string; source_type: string }>(
    `
    UPDATE document_queue
    SET status = 'parsing', updated_at = now()
    WHERE id = (
      SELECT id
      FROM document_queue
      WHERE status IN ('ready_to_parse', 'queued', 'failed')
        AND source_type IN ('house_ptr', 'senate_ptr')
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, url, source_type
    `,
    [],
  );
  if (!next) return { processed: false, reason: "no_work" };

  const queueId = next.id;
  const url = next.url;
  const source = String(next.source_type ?? "").trim() as PoliticianPtrSource;
  const chamber: Chamber = source === "senate_ptr" ? "senate" : "house";

  try {
    const loaded =
      source === "senate_ptr" ? await loadSenateFiling(url) : await loadHouseFiling(url);
    const { contentSha256, filing, model } = loaded;

    const existing = await db.one<{ id: string }>(
      `SELECT id FROM documents WHERE feed_kind='politicians' AND content_sha256 LIKE ($1 || ':%') LIMIT 1`,
      [contentSha256],
    );
    if (existing?.id) {
      await db.query(`UPDATE document_queue SET status='parsed', updated_at=now(), last_error=NULL WHERE id=$1`, [queueId]);
      return { processed: true, queue_id: queueId, parsed_ids: [existing.id], ticker_count: 1 };
    }

    const txRows = filterReportableStockTransactions(filing.transactions);
    if (!txRows.length) {
      await db.query(
        `UPDATE document_queue SET status='dead', last_error='skipped_no_reportable_transactions', next_attempt_at=NULL, updated_at=now() WHERE id=$1`,
        [queueId],
      );
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "no_reportable_transactions" };
    }

    const parsedIds = await persistPoliticianFiling({
      queueId,
      url,
      chamber,
      source,
      promptVersion: source === "senate_ptr" ? "senate_ptr_v1" : "house_ptr_v1",
      model,
      contentSha256,
      filing: filingFromParsed(filing),
    });

    if (!parsedIds.length) {
      await db.query(
        `UPDATE document_queue SET status='dead', last_error='skipped_missing_tickers', next_attempt_at=NULL, updated_at=now() WHERE id=$1`,
        [queueId],
      );
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "missing_tickers" };
    }

    await db.query(`UPDATE document_queue SET status='parsed', updated_at=now(), last_error=NULL WHERE id=$1`, [queueId]);
    return { processed: true, queue_id: queueId, parsed_ids: parsedIds, ticker_count: parsedIds.length };
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
      SET status = $2,
          last_error = $3,
          next_attempt_at = now() + ($4 || ' minutes')::interval,
          updated_at = now()
      WHERE id = $1
      `,
      [queueId, status, msg.slice(0, 2000), String(backoffMinutes)],
    );
    return { processed: false, reason: "busy", queue_id: queueId };
  }
}
