import { sha256NormalizedText } from "../../core/text-hash.js";
import { db } from "../../core/db.js";
import { llmChat } from "../../core/llm.js";
import { compactSecTextForLlm } from "../../core/sec-llm-text.js";
import { fetch13fFilingBundle } from "../../core/sec.js";
import { syncInstitutionFilingsFromDocument } from "../../documents/store.js";
import {
  MIN_PARSED_13F_HOLDINGS,
  parse13fHoldings,
  parse13fMeta,
  type Parsed13fHolding,
} from "./parse-13f.js";

type ParseNextResult =
  | { processed: false; reason: "no_work" }
  | { processed: false; reason: "busy"; queue_id: string }
  | { processed: false; reason: "skipped"; queue_id: string; skip_reason: string }
  | { processed: true; queue_id: string; parsed_ids: string[]; ticker_count: number };

const ACTIVITIES = new Set(["Increased stake", "New position", "Reduced stake"]);

function extractJsonObject(text: string): any {
  let raw = String(text ?? "").trim();
  if (!raw) throw new Error("empty_llm_response");
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("llm_output_not_json");
  }
}

function formatIso(ts: unknown): string | null {
  const d = new Date(String(ts ?? ""));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeActivity(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (ACTIVITIES.has(s)) return s;
  const low = s.toLowerCase();
  if (/new/.test(low) && /position|holding|stake/.test(low)) return "New position";
  if (/increas/.test(low)) return "Increased stake";
  if (/reduc|decreas|sold|exit/.test(low)) return "Reduced stake";
  return null;
}

function isInstitutionSchema(out: any): out is {
  schema_type: "institution_filing";
  schema_version: "v1";
  filer: { name: string | null; cik: string | null };
  filing: { form_type: string | null; accession_no: string | null; filed_at: string | null; index_url: string | null };
  holdings: Array<{
    ticker: string | null;
    issuer_name: string | null;
    activity: string | null;
    value_usd: number | null;
    shares: number | null;
    as_of_date: string | null;
  }>;
  context_sentences: string[];
} {
  return out?.schema_type === "institution_filing" && Array.isArray(out.holdings) && Array.isArray(out.context_sentences);
}

function buildInstitutionExtractionPrompt(args: { filingText: string; indexUrl: string }) {
  const filingBody = compactSecTextForLlm(args.filingText, 180_000);
  return [
    {
      role: "system" as const,
      content: [
        "You extract SEC Form 13F-HR institutional holdings into strict JSON.",
        "Return ONLY valid JSON. No markdown.",
        "activity must be exactly one of: Increased stake, New position, Reduced stake.",
        "Use ticker symbols when visible; skip rows without a US equity ticker.",
        `Schema: ${JSON.stringify({
          schema_type: "institution_filing",
          schema_version: "v1",
          filer: { name: "string|null", cik: "string|null" },
          filing: { form_type: "13F", accession_no: "string|null", filed_at: "ISO8601|null", index_url: "string|null" },
          holdings: [
            {
              ticker: "string",
              issuer_name: "string|null",
              activity: "Increased stake|New position|Reduced stake",
              value_usd: "number|null",
              shares: "number|null",
              as_of_date: "ISO8601|null",
            },
          ],
          context_sentences: ["string"],
        })}`,
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [`index_url: ${args.indexUrl}`, "", "FILING TEXT:", filingBody].join("\n"),
    },
  ];
}

function buildInstitutionEnrichPrompt(args: {
  indexUrl: string;
  coverExcerpt: string;
  holdings: Parsed13fHolding[];
  meta: ReturnType<typeof parse13fMeta>;
}) {
  const holdingsJson = JSON.stringify(
    args.holdings.slice(0, 400).map((h) => ({
      issuer_name: h.issuer_name,
      cusip: h.cusip,
      title_of_class: h.title_of_class,
      value_usd: h.value_usd,
      shares: h.shares,
    })),
  );
  return [
    {
      role: "system" as const,
      content: [
        "You enrich pre-parsed SEC Form 13F information-table rows into strict JSON.",
        "Return ONLY valid JSON. No markdown.",
        "Map each parsed holding to a US equity ticker when possible; omit rows with no ticker.",
        "activity must be exactly one of: Increased stake, New position, Reduced stake.",
        "Infer activity from filing cover / summary tables when present; otherwise use New position.",
        "context_sentences: exactly 3 plain-English summary sentences.",
        `Schema: ${JSON.stringify({
          schema_type: "institution_filing",
          schema_version: "v1",
          filer: { name: "string|null", cik: "string|null" },
          filing: { form_type: "13F", accession_no: "string|null", filed_at: "ISO8601|null", index_url: "string|null" },
          holdings: [
            {
              ticker: "string",
              issuer_name: "string|null",
              cusip: "string|null",
              activity: "Increased stake|New position|Reduced stake",
              value_usd: "number|null",
              shares: "number|null",
              as_of_date: "ISO8601|null",
            },
          ],
          context_sentences: ["string"],
        })}`,
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [
        `index_url: ${args.indexUrl}`,
        "KNOWN META:",
        JSON.stringify(args.meta),
        "",
        "COVER EXCERPT:",
        args.coverExcerpt.slice(0, 8_000),
        "",
        "PARSED_HOLDINGS:",
        holdingsJson,
      ].join("\n"),
    },
  ];
}

async function extractInstitutionFiling(args: {
  bundleText: string;
  indexUrl: string;
}): Promise<{ out: any; model: string | null; path: "enrich" | "full" }> {
  const parsedHoldings = parse13fHoldings(args.bundleText);
  const meta = parse13fMeta(args.bundleText, args.indexUrl);

  if (parsedHoldings.length >= MIN_PARSED_13F_HOLDINGS) {
    const { content, model } = await llmChat(
      buildInstitutionEnrichPrompt({
        indexUrl: args.indexUrl,
        coverExcerpt: args.bundleText.slice(0, 12_000),
        holdings: parsedHoldings,
        meta,
      }),
      {
        temperature: 0,
        max_tokens: 2800,
        response_format: "json_object",
        log_context: "institutions/13f-enrich",
      },
    );
    const out = extractJsonObject(content);
    if (isInstitutionSchema(out)) {
      const byParsedKey = new Map(
        parsedHoldings.map((p) => [`${(p.cusip ?? "").toUpperCase()}|${p.issuer_name.toLowerCase()}`, p]),
      );
      const enriched = (out.holdings ?? []).map((h: any) => {
        const key = `${String(h?.cusip ?? "").toUpperCase()}|${String(h?.issuer_name ?? "").toLowerCase()}`;
        const fallback = byParsedKey.get(key) ?? null;
        return {
          ...h,
          issuer_name: h?.issuer_name ?? fallback?.issuer_name ?? null,
          value_usd:
            h?.value_usd != null && Number.isFinite(Number(h.value_usd))
              ? Number(h.value_usd)
              : fallback?.value_usd ?? null,
          shares:
            h?.shares != null && Number.isFinite(Number(h.shares)) ? Number(h.shares) : fallback?.shares ?? null,
        };
      });

      const validCount = enriched.filter(
        (h: any) =>
          String(h?.ticker ?? "")
            .trim()
            .length >= 1 && normalizeActivity(h?.activity),
      ).length;
      const minValid = Math.max(3, Math.floor(parsedHoldings.length * 0.2));
      if (validCount >= minValid) {
        return {
          out: {
            ...out,
            filer: {
              name: out.filer?.name ?? meta.filer_name,
              cik: out.filer?.cik ?? meta.cik,
            },
            filing: {
              form_type: "13F",
              accession_no: out.filing?.accession_no ?? meta.accession_no,
              filed_at: out.filing?.filed_at ?? meta.filed_at ?? meta.period_of_report,
              index_url: args.indexUrl,
            },
            holdings: enriched,
          },
          model: model ?? null,
          path: "enrich",
        };
      }
    }
  }

  const { content, model } = await llmChat(buildInstitutionExtractionPrompt({ filingText: args.bundleText, indexUrl: args.indexUrl }), {
    temperature: 0,
    max_tokens: 2800,
    response_format: "json_object",
    log_context: "institutions/13f",
  });
  return { out: extractJsonObject(content), model: model ?? null, path: "full" };
}

export async function parseNextInstitutionsQueueItem(): Promise<ParseNextResult> {
  const next = await db.one<{ id: string; url: string }>(
    `
    UPDATE document_queue
    SET status = 'parsing', updated_at = now()
    WHERE id = (
      SELECT id
      FROM document_queue
      WHERE status IN ('ready_to_parse', 'queued', 'failed')
        AND source_type = 'sec_13f'
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
  const indexUrl = next.url;

  try {
    const { url: primaryUrl, bundle } = await fetch13fFilingBundle(indexUrl);
    const baseSha256 = sha256NormalizedText(bundle);

    const existing = await db.one<{ id: string }>(
      `SELECT id FROM documents WHERE feed_kind='institutions' AND content_sha256 LIKE ($1 || ':%') LIMIT 1`,
      [baseSha256],
    );
    if (existing?.id) {
      await db.query(`UPDATE document_queue SET status='parsed', updated_at=now(), last_error=NULL WHERE id=$1`, [queueId]);
      return { processed: true, queue_id: queueId, parsed_ids: [existing.id], ticker_count: 1 };
    }

    const { out, model } = await extractInstitutionFiling({ bundleText: bundle, indexUrl: primaryUrl });
    if (!isInstitutionSchema(out)) throw new Error("llm_output_schema_mismatch");

    const filerName = String(out.filer?.name ?? "").trim() || "Institution";
    const holdings = (out.holdings ?? [])
      .map((h) => ({
        ticker: String(h?.ticker ?? "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9.-]/g, ""),
        issuer_name: h?.issuer_name != null ? String(h.issuer_name) : null,
        activity: normalizeActivity(h?.activity),
        value_usd: h?.value_usd != null && Number.isFinite(Number(h.value_usd)) ? Number(h.value_usd) : null,
        shares: h?.shares != null && Number.isFinite(Number(h.shares)) ? Number(h.shares) : null,
        as_of_date: formatIso(h?.as_of_date),
      }))
      .filter((h) => h.ticker.length >= 1 && h.ticker.length <= 8 && h.activity);

    if (!holdings.length) {
      await db.query(
        `UPDATE document_queue SET status='dead', last_error='skipped_no_holdings', next_attempt_at=NULL, updated_at=now() WHERE id=$1`,
        [queueId],
      );
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "no_holdings" };
    }

    const byTicker = new Map<string, typeof holdings>();
    for (const h of holdings) {
      const arr = byTicker.get(h.ticker) ?? [];
      arr.push(h);
      byTicker.set(h.ticker, arr);
    }

    const parsedIds: string[] = [];
    for (const [ticker, rows] of byTicker.entries()) {
      const contentSha256 = `${baseSha256}:${ticker}`;
      rows.sort((a, b) => String(b.as_of_date ?? "").localeCompare(String(a.as_of_date ?? "")));

      const worksheet_rows = rows.map((r) => ({
        key: filerName,
        institution_name: filerName,
        surname: filerName,
        activity: r.activity,
        amount_usd: r.value_usd,
        shares: r.shares,
        ts: r.as_of_date ?? formatIso(out.filing?.filed_at),
      }));

      const sumUsd = worksheet_rows.reduce((a, r) => a + (Number(r.amount_usd ?? 0) || 0), 0);
      const feedLabel = sumUsd > 0 ? `${Math.round(sumUsd)} (${worksheet_rows.length})` : `(${worksheet_rows.length})`;
      const feedAt =
        worksheet_rows[0]?.ts ?? formatIso(out.filing?.filed_at) ?? new Date().toISOString();

      const institutions = [filerName];
      const data = {
        schema_type: "institution_cluster",
        schema_version: "v1",
        issuer: { name: rows[0]?.issuer_name ?? null, ticker, cik: null },
        filing: {
          form_type: "13F",
          accession_no: out.filing?.accession_no ?? null,
          filed_at: formatIso(out.filing?.filed_at) ?? feedAt,
          source: "sec_13f",
          index_url: primaryUrl,
        },
        cluster: {
          feed_label: feedLabel,
          cluster_start_at: worksheet_rows.at(-1)?.ts ?? null,
          cluster_end_at: worksheet_rows[0]?.ts ?? null,
          institutions,
          context_sentences: Array.isArray(out.context_sentences)
            ? out.context_sentences.map((s) => String(s)).filter(Boolean).slice(0, 3)
            : [],
          worksheet_rows,
        },
      };

      const inserted = await db.one<{ id: string }>(
        `
        INSERT INTO documents (
          queue_id, doc_kind, schema_version, ticker, feed_kind, source_key,
          event_at, feed_label, url, published_at, content_sha256, data
        )
        VALUES (
          $1, 'institution_cluster', 'v1', $2, 'institutions', '13F',
          $3, $4, $5, $6, $7, $8
        )
        ON CONFLICT (content_sha256) WHERE content_sha256 IS NOT NULL
        DO UPDATE SET parsed_at = now()
        RETURNING id
        `,
        [queueId, ticker, feedAt, feedLabel, primaryUrl, feedAt, contentSha256, data],
      );

      if (inserted?.id) {
        parsedIds.push(inserted.id);
        await syncInstitutionFilingsFromDocument(inserted.id, ticker, data);
      }
    }

    await db.query(`UPDATE document_queue SET status='parsed', updated_at=now(), last_error=NULL WHERE id=$1`, [queueId]);
    return { processed: true, queue_id: queueId, parsed_ids: parsedIds, ticker_count: byTicker.size };
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
    return { processed: false, reason: "busy", queue_id: queueId };
  }
}
