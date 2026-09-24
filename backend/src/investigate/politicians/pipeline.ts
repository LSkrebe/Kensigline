import {resolveStockNames} from './resolve-stock.js';
import { db } from "../../core/db.js";
import {
  fetchSenatePtrHtml,
  openSenateSession,
  parseSenatePtrHtml,
  type ParsedSenatePtr,
} from "../../core/senate.js";
import { buildParseMeta, logParseOutcome } from "../../shared/parse-meta.js";
import { failQueueWithBackoff, markQueueDead, markQueueParsed } from "../../shared/queue.js";
import { createHash } from "node:crypto";
import { extractPdfTextWithFallback } from "../../core/pdf.js";
import {
  MIN_HOUSE_PTR_CONFIDENT_ROWS,
  parseHousePtrPdfText,
} from "./house-ptr-parse.js";
import {
  MIN_OGE_278T_CONFIDENT_ROWS,
  parseOge278tPdfText,
} from "./oge-278t-parse.js";
import { getSecTickerTitleMap } from "../../core/sec.js";
import { isOlderThanRetentionWindow } from "../../shared/ingest-policy.js";
import { shouldIngestFiler } from "../../explore/watchlist-catalog.js";
import { lookupPoliticianCommittee } from "../../politicians/committees.js";
import {
  ensureFiler,
  ensureIssuer,
  insertFiling,
  replacePoliticianTransactions,
  upsertFeedEntry,
} from "../../v2/canonical.js";

type PoliticianPtrSource = "house_ptr" | "senate_ptr" | "oge_278t";
type Chamber = "house" | "senate" | "executive";

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
  is_amendment?: boolean;
  pdf_url: string | null;
  transactions: PoliticianTxn[];
  context_sentences: string[];
};

function formatIso(ts: any): string | null {
  const d = new Date(String(ts ?? ""));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function stripNullBytes(s: string | null | undefined): string | null {
  if (s == null) return null;
  const cleaned = String(s).replace(/\u0000/g, "").trim();
  return cleaned || null;
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

async function fetchPdfBytes(url: string): Promise<Buffer> {
  const r = await fetch(url, {
    headers: { "user-agent": "kensigline/0.1 (+politicians-ptr)" },
  });
  if (!r.ok) throw new Error(`ptr_pdf_fetch_failed_${r.status}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

const PTR_REPORTABLE_TYPES = new Set(["P", "S", "E"]);

/** Stock + option rows for P/S/E — matches Investigate PTR transaction filters in the UI. */
function filterReportableStockTransactions(txAll: PoliticianTxn[]) {
  return txAll.filter((t) => {
    const type = String(t?.transaction_type ?? "").trim().toUpperCase();
    if (!PTR_REPORTABLE_TYPES.has(type)) return false;
    const at = String(t?.asset_type ?? "").trim().toUpperCase();
    return at === "ST" || at === "OP";
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
        is_amendment: Boolean(parsed.is_amendment),
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

async function loadOge278tFiling(url: string): Promise<{ filing: PoliticianFiling; contentSha256: string; model: string | null }> {
  const pdf = await fetchPdfBytes(url);
  const contentSha256 = createHash("sha256").update(pdf).digest("hex");
  const { text: pdfText } = await extractPdfTextWithFallback(pdf);

  const parsed = parseOge278tPdfText(pdfText, url);
  parsed.transactions=resolveStockNames(parsed.transactions,await getSecTickerTitleMap());
  if (parsed.confident_rows >= MIN_OGE_278T_CONFIDENT_ROWS || parsed.transactions.length) {
    return {
      contentSha256,
      model: null,
      filing: {
        filer: parsed.filer,
        filing_id: parsed.filing_id,
        filed_at: parsed.filed_at,
        source: "oge_278t",
        pdf_url: url,
        transactions: parsed.transactions,
        context_sentences: parsed.context_sentences,
      },
    };
  }

  throw new Error("oge_278t_low_confidence_parse");
}

function chamberForSource(source: PoliticianPtrSource): Chamber {
  if (source === "senate_ptr") return "senate";
  if (source === "oge_278t") return "executive";
  return "house";
}

function promptVersionForSource(source: PoliticianPtrSource): string {
  if (source === "senate_ptr") return "senate_ptr_v1";
  if (source === "oge_278t") return "oge_278t_v1";
  return "house_ptr_v1";
}

export async function persistPoliticianFiling(opts: {
  queueId: string;
  url: string;
  chamber: Chamber;
  source: PoliticianPtrSource;
  is_amendment?: boolean;
  promptVersion: string;
  model: string | null;
  contentSha256: string;
  filing: PoliticianFiling;
}): Promise<string[]> {
  const { queueId, url, chamber, source, promptVersion, model, contentSha256, filing } = opts;
  if (isOlderThanRetentionWindow(filing.filed_at)) {
    console.info("[retention] skip politician filing outside 2y window", filing.filed_at);
    return [];
  }
  if (chamber === "house" && !filing.filed_at) throw new Error("house_ptr_missing_signature_date");
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
  const filerName = String(filing.filer?.name ?? "").trim();
  if (!filerName) return [];

  const filer = await ensureFiler({
    filerType: "politician",
    displayName: filerName,
    detail: chamber,
    detailSecondary: filing.filer?.state_district ?? null,
  });
  const committee = (await lookupPoliticianCommittee(filerName)) || null;

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
        asset_name: t?.asset_name ? /\[(ST|OP)\]/.test(t.asset_name) ? t.asset_name : t.asset_name+(t.asset_type==='ST'?' [ST]':t.asset_type==='OP'?' [OP]':'') : null,
        ticker,
        description: t?.description ?? null,
      };
    });

    const sumMid = worksheet_rows.reduce((a: number, r: any) => a + (Number(r?.amount_usd_mid ?? 0) || 0), 0);
    const feedLabel = sumMid > 0 ? `${Math.round(sumMid)} (${worksheet_rows.length})` : `(${worksheet_rows.length})`;
    const feedAt =
      formatIso(filing.filed_at) ??
      formatIso(txs[0]?.notification_date) ??
      formatIso(txs[0]?.transaction_date) ??
      new Date().toISOString();

    const issuer = await ensureIssuer({
      ticker,
      name: secTitles.get(ticker) ?? ticker,
    });

    const filingId = await insertFiling({
      queueId,
      sourceType: source,
      feedKind: "politicians",
      form: filing.is_amendment ? "PTR/A" : "PTR",
      issuerId: issuer.id,
      url,
      pdfUrl: url,
      accessionNo: stripNullBytes(filing.filing_id),
      title: feedLabel,
      sourceKey: "PTR",
      analysis: stripNullBytes(
        Array.isArray(filing.context_sentences)
          ? filing.context_sentences.map((s) => String(s)).filter(Boolean)[0] ?? feedLabel
          : feedLabel,
      ),
      filedAt: formatIso(filing.filed_at),
      eventAt: feedAt,
      contentSha256: docSha,
    });

    const txnRows = [];
    for (const r of worksheet_rows) {
      if (!r.ts) continue;
      txnRows.push({
        filerId: filer.id,
        chamber,
        committee: stripNullBytes(committee),
        transactionType: r.transaction_type ? stripNullBytes(String(r.transaction_type)) : null,
        amountUsd: r.amount_usd_mid != null ? Number(r.amount_usd_mid) : null,
        amountUsdMid: r.amount_usd_mid != null ? Number(r.amount_usd_mid) : null,
        amountRange: r.amount_range ? stripNullBytes(String(r.amount_range)) : null,
        assetName: r.asset_name ? stripNullBytes(String(r.asset_name)) : null,
        description: r.description ? stripNullBytes(String(r.description)) : null,
        transactionAt: String(r.ts),
      });
    }
    await replacePoliticianTransactions(filingId, issuer.id, txnRows);
    await upsertFeedEntry({
      feedKind: "politicians",
      issuerId: issuer.id,
      filingId,
      feedAt,
      feedLabel,
      todayCount: txnRows.length,
    });
    parsedIds.push(filingId);
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
        AND source_type IN ('house_ptr', 'senate_ptr', 'oge_278t')
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
  const chamber = chamberForSource(source);
  // Long scanned reports must not be reclaimed while their OCR is still running.
  const heartbeat=setInterval(()=>void db.query("UPDATE document_queue SET updated_at=now() WHERE id=$1 AND status='parsing'",[queueId]).catch(()=>{}),60000);
  try {
    const loaded =
      source === "senate_ptr"
        ? await loadSenateFiling(url)
        : source === "oge_278t"
          ? await loadOge278tFiling(url)
          : await loadHouseFiling(url);
    const { contentSha256, filing, model } = loaded;

    // Use filings_url_idx — one PTR URL fans out to many `${sha}:${ticker}` rows.
    const existing = await db.one<{ id: string }>(
      `SELECT id FROM filings WHERE url = $1 LIMIT 1`,
      [url],
    );
    if (existing?.id) {
      await markQueueParsed(queueId, "duplicate_sha");
      logParseOutcome({
        source_type: source,
        queue_id: queueId,
        outcome: "parsed",
        path: `deterministic/${source}`,
        llm_used: false,
        note: "duplicate_sha",
      });
      return { processed: true, queue_id: queueId, parsed_ids: [existing.id], ticker_count: 1 };
    }

    const txRows = filterReportableStockTransactions(filing.transactions);
    if (!txRows.length) {
      await markQueueDead(queueId, "skipped_no_reportable_transactions");
      logParseOutcome({
        source_type: source,
        queue_id: queueId,
        outcome: "skipped",
        path: `deterministic/${source}`,
        skip_reason: "no_reportable_transactions",
        llm_used: false,
      });
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "no_reportable_transactions" };
    }

    const filerName = String(filing.filer?.name ?? "").trim();
    if (!filerName) {
      await markQueueDead(queueId, "skipped_missing_filer_name");
      logParseOutcome({
        source_type: source,
        queue_id: queueId,
        outcome: "skipped",
        path: `deterministic/${source}`,
        skip_reason: "missing_filer_name",
        llm_used: false,
      });
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "missing_filer_name" };
    }

    if (!shouldIngestFiler(filerName)) {
      await markQueueDead(queueId, "skipped_outside_tracked_universe");
      logParseOutcome({
        source_type: source,
        queue_id: queueId,
        outcome: "skipped",
        path: `deterministic/${source}`,
        skip_reason: "outside_tracked_universe",
        llm_used: false,
      });
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "outside_tracked_universe" };
    }

    const parsedIds = await persistPoliticianFiling({
      queueId,
      url,
      chamber,
      source,
      promptVersion: promptVersionForSource(source),
      model,
      contentSha256,
      filing: filingFromParsed(filing),
    });

    if (!parsedIds.length) {
      await markQueueDead(queueId, "skipped_missing_tickers_or_filer");
      logParseOutcome({
        source_type: source,
        queue_id: queueId,
        outcome: "skipped",
        path: `deterministic/${source}`,
        skip_reason: "missing_tickers_or_filer",
        llm_used: false,
      });
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "missing_tickers" };
    }

    await markQueueParsed(queueId);
    logParseOutcome({
      source_type: source,
      queue_id: queueId,
      outcome: "parsed",
      path: `deterministic/${source}`,
      llm_used: false,
      ticker_count: parsedIds.length,
    });
    return { processed: true, queue_id: queueId, parsed_ids: parsedIds, ticker_count: parsedIds.length };
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    // Permanent poison — don't burn retries on broken unicode payloads.
    if (/poison_|house_ptr_low_confidence|oge_278t_low_confidence/i.test(msg)) {
      await markQueueDead(queueId, msg.slice(0, 2000));
      logParseOutcome({
        source_type: source,
        queue_id: queueId,
        outcome: "dead",
        error: msg.slice(0, 200),
        llm_used: false,
      });
      return { processed: false, reason: "busy", queue_id: queueId };
    }
    await failQueueWithBackoff(queueId, err);
    logParseOutcome({
      source_type: source,
      queue_id: queueId,
      outcome: "failed",
      error: msg.slice(0, 200),
      llm_used: false,
    });
    return { processed: false, reason: "busy", queue_id: queueId };
  } finally {clearInterval(heartbeat);}
}
