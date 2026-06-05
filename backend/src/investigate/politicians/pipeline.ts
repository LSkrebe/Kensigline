import { db } from "../../core/db.js";
import { llmChat } from "../../core/llm.js";
import { syncPoliticianTransactionsFromDocument } from "../../documents/store.js";
import { createHash } from "node:crypto";
import { extractPdfTextWithFallback } from "../../core/pdf.js";
import { createRequire } from "node:module";

type ParseNextResult =
  | { processed: false; reason: "no_work" }
  | { processed: false; reason: "busy"; queue_id: string }
  | { processed: false; reason: "skipped"; queue_id: string; skip_reason: string }
  | { processed: true; queue_id: string; parsed_ids: string[]; ticker_count: number };

function extractJsonObject(text: string): any {
  const require = createRequire(import.meta.url);
  let raw = String(text ?? "").trim();
  if (!raw) throw new Error("empty_llm_response");
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    // Try to salvage a JSON object substring.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sub = raw.slice(start, end + 1);
      try {
        return JSON.parse(sub);
      } catch {
        // Repair common JSON issues from LLMs (missing quotes, trailing commas, etc.)
        // while keeping output as strict JSON.
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

function isPoliticianSchema(out: any): out is {
  schema_type: "politician_filing";
  schema_version: "v1";
  filer: { name: string | null; office: string | null; state_district: string | null };
  filing: { filing_id: string | null; filed_at: string | null; source: "house_ptr"; pdf_url: string | null };
  transactions: Array<{
    owner: string | null;
    asset_name: string | null;
    ticker: string | null;
    asset_type: string | null;
    transaction_type: string | null;
    transaction_date: string | null;
    notification_date: string | null;
    amount_range: string | null;
    description: string | null;
  }>;
  context_sentences: string[];
} {
  return (
    out &&
    typeof out === "object" &&
    out.schema_type === "politician_filing" &&
    out.schema_version &&
    Array.isArray(out.transactions) &&
    Array.isArray(out.context_sentences)
  );
}

function buildPoliticiansExtractionPrompt(args: { pdfText: string; pdfUrl: string; filingId: string | null }) {
  const { pdfText, pdfUrl, filingId } = args;
  return [
    {
      role: "system" as const,
      content: [
        "You extract U.S. House STOCK Act Periodic Transaction Report (PTR) PDFs into strict JSON.",
        "Return ONLY valid JSON. No markdown. No extra keys beyond the schema.",
        "Do not invent facts. If missing, use null/empty arrays.",
        "Keep context sentences plain English with normal punctuation and no semicolons.",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [
        "SCHEMA (return exactly this shape):",
        "{",
        '  \"schema_type\": \"politician_filing\",',
        '  \"schema_version\": \"v1\",',
        '  \"filer\": { \"name\": string|null, \"office\": string|null, \"state_district\": string|null },',
        '  \"filing\": { \"filing_id\": string|null, \"filed_at\": string|null, \"source\": \"house_ptr\", \"pdf_url\": string|null },',
        "  \"transactions\": Array<{",
        "    \"owner\": string|null,",
        "    \"asset_name\": string|null,",
        "    \"ticker\": string|null,",
        "    \"asset_type\": string|null,",
        "    \"transaction_type\": string|null,",
        "    \"transaction_date\": string|null,",
        "    \"notification_date\": string|null,",
        "    \"amount_range\": string|null,",
        "    \"description\": string|null",
        "  }>,",
        "  \"context_sentences\": string[]",
        "}",
        "",
        "GUIDANCE:",
        "- Extract ALL transaction rows you can find. Use tickers in parentheses when present.",
        "- `transaction_type` is a single letter like P, S, E (copy what is shown).",
        "- `amount_range` should be copied exactly like \"$1,001 - $15,000\" when present.",
        "- `context_sentences`: write exactly 3 sentences summarizing the filing at a high level (who + what tickers + approximate sizes + reporting lag).",
        "",
        "CRITICAL JSON RULES:",
        "- Return ONLY JSON, starting with '{' and ending with '}'.",
        "- Do NOT include trailing commas.",
        "- Do NOT include unescaped newlines inside strings.",
        "",
        "KNOWN METADATA:",
        JSON.stringify({ pdf_url: pdfUrl, filing_id: filingId, source: "house_ptr" }),
        "",
        "PDF TEXT (best-effort extraction):",
        pdfText.slice(0, 180_000),
      ].join("\n"),
    },
  ];
}

async function fetchPdfBytes(url: string): Promise<Buffer> {
  const r = await fetch(url, {
    headers: { "user-agent": "kensigline/0.1 (+politicians-ptr)" },
  });
  if (!r.ok) throw new Error(`ptr_pdf_fetch_failed_${r.status}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

export async function parseNextPoliticiansQueueItem(): Promise<ParseNextResult> {
  const next = await db.one<{ id: string; url: string }>(
    `
    UPDATE document_queue
    SET status = 'parsing', updated_at = now()
    WHERE id = (
      SELECT id
      FROM document_queue
      WHERE status IN ('ready_to_parse', 'queued', 'failed')
        AND source_type = 'house_ptr'
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, url
    `,
    [],
  );
  if (!next) return { processed: false, reason: "no_work" };

  const queueId = next.id;
  const url = next.url;

  try {
    const pdf = await fetchPdfBytes(url);
    const baseSha256 = createHash("sha256").update(pdf).digest("hex");

    // If we've already parsed this exact PDF content, mark parsed and exit.
    const existing = await db.one<{ id: string }>(
      `SELECT id FROM documents WHERE feed_kind='politicians' AND content_sha256 LIKE ($1 || ':%') LIMIT 1`,
      [baseSha256],
    );
    if (existing?.id) {
      await db.query(`UPDATE document_queue SET status='parsed', updated_at=now(), last_error=NULL WHERE id=$1`, [queueId]);
      return { processed: true, queue_id: queueId, parsed_ids: [existing.id], ticker_count: 1 };
    }

    const filingId = (url.match(/\/(\d+)\.pdf$/i) ?? [])[1] ?? null;
    const { text: pdfText } = await extractPdfTextWithFallback(pdf);

    const messages = buildPoliticiansExtractionPrompt({ pdfText, pdfUrl: url, filingId });
    const { content, model } = await llmChat(messages, { temperature: 0, max_tokens: 3200, response_format: "json_object" });
    const out = extractJsonObject(content);
    if (!isPoliticianSchema(out)) throw new Error("llm_output_schema_mismatch");

    // Filter: only Purchases (P). Default to stock-like rows (asset_type often [ST]).
    const txAll = Array.isArray(out.transactions) ? out.transactions : [];
    const txP0 = txAll.filter((t) => String(t?.transaction_type ?? "").trim().toUpperCase() === "P");
    const txP = txP0.filter((t) => {
      const at = String(t?.asset_type ?? "").trim().toUpperCase();
      // Keep common stock rows; if asset_type is missing, keep it (LLM sometimes omits).
      return !at || at.includes("ST") || /\bCOMMON STOCK\b/i.test(String(t?.asset_name ?? ""));
    });
    if (txP.length === 0) {
      await db.query(
        `UPDATE document_queue SET status='dead', last_error='skipped_no_P_transactions', next_attempt_at=NULL, updated_at=now() WHERE id=$1`,
        [queueId],
      );
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "no_P_transactions" };
    }

    // Group P transactions by ticker (best-effort).
    const byTicker = new Map<string, any[]>();
    for (const t of txP) {
      const ticker = String(t?.ticker ?? "").trim().toUpperCase();
      if (!ticker) continue;
      const arr = byTicker.get(ticker) ?? [];
      arr.push(t);
      byTicker.set(ticker, arr);
    }
    if (byTicker.size === 0) {
      await db.query(
        `UPDATE document_queue SET status='dead', last_error='skipped_missing_tickers', next_attempt_at=NULL, updated_at=now() WHERE id=$1`,
        [queueId],
      );
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "missing_tickers" };
    }

    const parsedIds: string[] = [];
    for (const [ticker, txs] of byTicker.entries()) {
      const contentSha256 = `${baseSha256}:${ticker}`;
      // Sort newest-first by notification date then transaction date.
      txs.sort((a, b) => String(b?.notification_date ?? "").localeCompare(String(a?.notification_date ?? "")));
      const politicians = [String(out?.filer?.name ?? "").trim()].filter(Boolean);
      const worksheet_rows = txs.map((t) => {
        const amt = parseUsdAmountRange(t?.amount_range ?? null);
        return {
          key: String(out?.filer?.name ?? "").trim() || "POLITICIAN",
          ts: formatIso(t?.transaction_date) ?? formatIso(t?.notification_date),
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
        formatIso(out?.filing?.filed_at) ??
        new Date().toISOString();

      const data = {
        schema_type: "politician_cluster",
        schema_version: "v1",
        issuer: { name: null, ticker, cik: null },
        filing: {
          form_type: "PTR",
          accession_no: filingId,
          filed_at: formatIso(out?.filing?.filed_at) ?? feedAt,
          source: "house_ptr",
          pdf_url: url,
        },
        cluster: {
          feed_label: feedLabel,
          cluster_start_at: worksheet_rows.at(-1)?.ts ?? null,
          cluster_end_at: worksheet_rows[0]?.ts ?? null,
          politicians,
          context_sentences: Array.isArray(out.context_sentences)
            ? out.context_sentences.map((s: any) => String(s)).filter(Boolean).slice(0, 3)
            : [],
          worksheet_rows,
        },
      };

      const inserted = await db.one<{ id: string }>(
        `
        INSERT INTO documents (
          queue_id,
          doc_kind,
          schema_version,
          ticker,
          feed_kind,
          source_key,
          event_at,
          feed_label,
          url,
          published_at,
          model,
          prompt_version,
          content_sha256,
          data
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          'politicians',
          'PTR',
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12
        )
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
          model,
          "house_ptr_v1",
          contentSha256,
          data,
        ],
      );
      if (inserted?.id) {
        parsedIds.push(inserted.id);
        if (ticker) await syncPoliticianTransactionsFromDocument(inserted.id, ticker, data);
      }
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

