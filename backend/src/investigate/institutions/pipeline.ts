import { sha256NormalizedText } from "../../core/text-hash.js";
import { db } from "../../core/db.js";
import { llmChat } from "../../core/llm.js";
import { compactSecTextForLlm } from "../../core/sec-llm-text.js";
import { LLM_BUDGETS } from "../../core/llm-budgets.js";
import { prepareLlmText } from "../../core/llm-text-prep.js";
import { fetch13fFilingBundle } from "../../core/sec.js";
import { buildParseMeta, logParseOutcome, type DocumentParseMeta } from "../../shared/parse-meta.js";
import {
  ensureFiler,
  ensureIssuer,
  insertFiling,
  replaceInstitutionTransactions,
  upsertFeedEntry,
} from "../../v2/canonical.js";
import { isPlausibleTrackedFiler } from "../../research/market/tracked-investors-filter.js";
import { claimQueueItemSingle, failQueueWithBackoff, markQueueDead, markQueueParsed } from "../../shared/queue.js";
import {
  MIN_PARSED_13F_HOLDINGS,
  parse13fHoldings,
  parse13fMeta,
  type Parsed13fHolding,
} from "./parse-13f.js";
import {
  activityFromShareDelta,
  ensureCusipTickerMapTable,
  institutionsLlmFallbackEnabled,
  learnCusipTicker,
  loadPriorFilerHolding,
  resolveHoldingsToTickers,
  type Mapped13fHolding,
} from "./resolve-13f-tickers.js";

type ParseNextResult =
  | { processed: false; reason: "no_work" }
  | { processed: false; reason: "busy"; queue_id: string }
  | { processed: false; reason: "skipped"; queue_id: string; skip_reason: string }
  | { processed: true; queue_id: string; parsed_ids: string[]; ticker_count: number };

const ACTIVITIES = new Set(["Increased stake", "New position", "Reduced stake"]);
const ENRICH_HOLDINGS_LLM_LIMIT = 120;

type HoldingRow = {
  ticker: string;
  issuer_name: string | null;
  cusip: string | null;
  activity: string;
  value_usd: number | null;
  shares: number | null;
  as_of_date: string | null;
  unchanged: boolean;
};

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
    cusip?: string | null;
    activity: string | null;
    value_usd: number | null;
    shares: number | null;
    as_of_date: string | null;
  }>;
  context_sentences: string[];
} {
  return out?.schema_type === "institution_filing" && Array.isArray(out.holdings);
}

function buildInstitutionExtractionPrompt(args: { filingText: string; indexUrl: string }) {
  const prep = prepareLlmText({
    text: args.filingText,
    context: "institutions/13f-full",
    maxChars: LLM_BUDGETS.institution13fFull(),
    compact: compactSecTextForLlm,
  });
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
        })}`,
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [`index_url: ${args.indexUrl}`, "", "FILING TEXT:", prep.text].join("\n"),
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
        "Prefer New position when activity is unknown.",
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

/** Rare residual LLM path — only when deterministic mapping yields zero tickers. */
async function extractInstitutionFilingLlmResidual(args: {
  bundleText: string;
  indexUrl: string;
}): Promise<{ out: any; model: string | null; path: "enrich" | "full" }> {
  const parsedHoldings = parse13fHoldings(args.bundleText);
  const meta = parse13fMeta(args.bundleText, args.indexUrl);

  if (parsedHoldings.length >= MIN_PARSED_13F_HOLDINGS) {
    const { content, model } = await llmChat(
      buildInstitutionEnrichPrompt({
        indexUrl: args.indexUrl,
        coverExcerpt: prepareLlmText({
          text: args.bundleText,
          context: "institutions/13f-cover",
          maxChars: LLM_BUDGETS.institution13fCover(),
          compact: (t, max) => t.slice(0, max),
          stripBoilerplate: true,
        }).text,
        holdings: parsedHoldings.slice(0, ENRICH_HOLDINGS_LLM_LIMIT),
        meta,
      }),
      {
        temperature: 0,
        max_tokens: 2200,
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
          cusip: h?.cusip ?? fallback?.cusip ?? null,
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
      const minValid = Math.max(1, Math.min(3, Math.floor(parsedHoldings.length * 0.05) || 1));
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
    max_tokens: 2200,
    response_format: "json_object",
    log_context: "institutions/13f",
  });
  return { out: extractJsonObject(content), model: model ?? null, path: "full" };
}

async function attachActivities(
  filerName: string,
  mapped: Mapped13fHolding[],
  asOf: string | null,
): Promise<{ rows: HoldingRow[]; unchanged_holdings: number }> {
  const rows: HoldingRow[] = [];
  let unchanged_holdings = 0;
  for (const h of mapped) {
    const prior = await loadPriorFilerHolding({ filerName, ticker: h.ticker });
    const { activity, unchanged } = activityFromShareDelta({
      shares: h.shares,
      priorShares: prior?.shares ?? null,
      priorActivity: prior?.activity ?? null,
    });
    if (unchanged) unchanged_holdings += 1;
    rows.push({
      ticker: h.ticker,
      issuer_name: h.issuer_name,
      cusip: h.cusip,
      activity,
      value_usd: h.value_usd,
      shares: h.shares,
      as_of_date: asOf,
      unchanged,
    });
  }
  return { rows, unchanged_holdings };
}

async function persistInstitutionHoldings(args: {
  queueId: string;
  primaryUrl: string;
  baseSha256: string;
  filerName: string;
  accessionNo: string | null;
  filedAt: string | null;
  holdings: HoldingRow[];
  parseMeta: DocumentParseMeta;
}): Promise<string[]> {
  const byTicker = new Map<string, HoldingRow[]>();
  for (const h of args.holdings) {
    const arr = byTicker.get(h.ticker) ?? [];
    arr.push(h);
    byTicker.set(h.ticker, arr);
  }

  const parsedIds: string[] = [];
  const institutionFiler = await ensureFiler({
    filerType: "institution",
    displayName: args.filerName,
  });

  for (const [ticker, rows] of byTicker.entries()) {
    const contentSha256 = `${args.baseSha256}:${ticker}`;
    rows.sort((a, b) => String(b.as_of_date ?? "").localeCompare(String(a.as_of_date ?? "")));

    const worksheet_rows = rows.map((r) => ({
      key: args.filerName,
      institution_name: args.filerName,
      surname: args.filerName,
      activity: r.activity,
      amount_usd: r.value_usd,
      shares: r.shares,
      cusip: r.cusip,
      ts: r.as_of_date ?? formatIso(args.filedAt),
    }));

    const sumUsd = worksheet_rows.reduce((a, r) => a + (Number(r.amount_usd ?? 0) || 0), 0);
    const feedLabel = sumUsd > 0 ? `${Math.round(sumUsd)} (${worksheet_rows.length})` : `(${worksheet_rows.length})`;
    const feedAt = worksheet_rows[0]?.ts ?? formatIso(args.filedAt) ?? new Date().toISOString();

    const issuer = await ensureIssuer({
      ticker,
      name: rows[0]?.issuer_name ?? ticker,
    });

    const filingId = await insertFiling({
      queueId: args.queueId,
      sourceType: "sec_13f",
      feedKind: "institutions",
      form: "13F",
      issuerId: issuer.id,
      url: args.primaryUrl,
      indexUrl: args.primaryUrl,
      accessionNo: args.accessionNo,
      title: feedLabel,
      sourceKey: "13F",
      analysis: feedLabel,
      filedAt: formatIso(args.filedAt) ?? feedAt,
      eventAt: feedAt,
      contentSha256,
    });

    const txnRows = [];
    for (const r of worksheet_rows) {
      if (!r.ts) continue;
      const amt = r.amount_usd != null ? Number(r.amount_usd) : null;
      if (!isPlausibleTrackedFiler(args.filerName, Number.isFinite(amt as number) ? (amt as number) : null)) {
        continue;
      }
      txnRows.push({
        filerId: institutionFiler.id,
        activity: r.activity ? String(r.activity) : null,
        amountUsd: Number.isFinite(amt as number) ? amt : null,
        shares: r.shares != null ? Number(r.shares) : null,
        transactionAt: String(r.ts),
      });
    }
    await replaceInstitutionTransactions(filingId, issuer.id, txnRows);
    await upsertFeedEntry({
      feedKind: "institutions",
      issuerId: issuer.id,
      filingId,
      feedAt,
      feedLabel,
      todayCount: txnRows.length,
    });
    parsedIds.push(filingId);
    for (const r of rows) {
      if (r.cusip) void learnCusipTicker(r.cusip, ticker, "13f_persist");
    }
  }
  return parsedIds;
}

export async function parseNextInstitutionsQueueItem(): Promise<ParseNextResult> {
  await ensureCusipTickerMapTable().catch(() => {});

  const next = await claimQueueItemSingle("sec_13f");
  if (!next) return { processed: false, reason: "no_work" };

  const queueId = next.id;
  const indexUrl = next.url;

  try {
    const { url: primaryUrl, bundle } = await fetch13fFilingBundle(indexUrl);
    const baseSha256 = sha256NormalizedText(bundle);

    const existing = await db.one<{ id: string }>(
      `SELECT id FROM filings WHERE feed_kind='institutions' AND content_sha256 LIKE ($1 || ':%') LIMIT 1`,
      [baseSha256],
    );
    if (existing?.id) {
      await markQueueParsed(queueId, "duplicate_sha");
      logParseOutcome({
        source_type: "sec_13f",
        queue_id: queueId,
        outcome: "parsed",
        path: "reuse/duplicate_sha",
        llm_used: false,
      });
      return { processed: true, queue_id: queueId, parsed_ids: [existing.id], ticker_count: 1 };
    }

    const parsedHoldings = parse13fHoldings(bundle);
    const meta = parse13fMeta(bundle, primaryUrl);
    const filerName = String(meta.filer_name ?? "").trim() || "Institution";
    const asOf = formatIso(meta.period_of_report) ?? formatIso(meta.filed_at);

    if (!parsedHoldings.length) {
      await markQueueDead(queueId, "skipped_no_holdings");
      logParseOutcome({
        source_type: "sec_13f",
        queue_id: queueId,
        outcome: "skipped",
        path: "institutions/13f-deterministic",
        skip_reason: "no_holdings",
        llm_used: false,
        holdings_parsed: 0,
      });
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "no_holdings" };
    }

    const { mapped, stats } = await resolveHoldingsToTickers(parsedHoldings);
    let holdings: HoldingRow[] = [];
    let unchanged_holdings = 0;
    let path = "institutions/13f-deterministic";
    let llm_used = false;
    let llm_ok: boolean | null = null;
    let llm_model: string | null = null;
    let activity_source: string = "share_delta";
    let resolvedFiler = filerName;

    if (mapped.length >= 1) {
      const attached = await attachActivities(filerName, mapped, asOf);
      holdings = attached.rows;
      unchanged_holdings = attached.unchanged_holdings;
    } else if (institutionsLlmFallbackEnabled()) {
      const { out, model, path: llmPath } = await extractInstitutionFilingLlmResidual({
        bundleText: bundle,
        indexUrl: primaryUrl,
      });
      if (!isInstitutionSchema(out)) throw new Error("llm_output_schema_mismatch");
      llm_used = true;
      llm_ok = true;
      llm_model = model;
      path = "institutions/13f-llm-residual";
      activity_source = llmPath === "enrich" ? "llm_enrich" : "llm_full";
      resolvedFiler = String(out.filer?.name ?? "").trim() || filerName;

      const llmMapped: Mapped13fHolding[] = [];
      for (const h of out.holdings ?? []) {
        const ticker = String(h?.ticker ?? "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9.-]/g, "");
        if (!ticker || ticker.length > 8) continue;
        llmMapped.push({
          issuer_name: h?.issuer_name != null ? String(h.issuer_name) : "Unknown",
          cusip: h?.cusip != null ? String(h.cusip) : null,
          title_of_class: null,
          value_usd: h?.value_usd != null && Number.isFinite(Number(h.value_usd)) ? Number(h.value_usd) : null,
          shares: h?.shares != null && Number.isFinite(Number(h.shares)) ? Number(h.shares) : null,
          ticker,
          resolve_source: "llm",
        });
        if (h?.cusip) void learnCusipTicker(String(h.cusip), ticker, "llm_residual");
      }

      // Prefer share-delta activity even on LLM ticker residual.
      const attached = await attachActivities(resolvedFiler, llmMapped, formatIso(out.filing?.filed_at) ?? asOf);
      holdings = attached.rows;
      unchanged_holdings = attached.unchanged_holdings;
      stats.mapped = holdings.length;
      stats.unmapped = Math.max(0, parsedHoldings.length - holdings.length);
    } else {
      await markQueueDead(
        queueId,
        `skipped_no_mapped_tickers holdings=${parsedHoldings.length}`,
      );
      logParseOutcome({
        source_type: "sec_13f",
        queue_id: queueId,
        outcome: "skipped",
        path: "institutions/13f-deterministic",
        skip_reason: "no_mapped_tickers",
        llm_used: false,
        ...stats,
      });
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "no_mapped_tickers" };
    }

    if (!holdings.length) {
      await markQueueDead(queueId, "skipped_no_holdings");
      logParseOutcome({
        source_type: "sec_13f",
        queue_id: queueId,
        outcome: "skipped",
        path,
        skip_reason: "no_holdings_after_resolve",
        llm_used,
        ...stats,
      });
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "no_holdings" };
    }

    const parseMeta = buildParseMeta({
      path,
      llm_used,
      llm_ok,
      llm_model,
      source_type: "sec_13f",
      holdings_parsed: stats.holdings_parsed,
      mapped: holdings.length,
      unmapped: stats.unmapped,
      cusip_hits: stats.cusip_hits,
      name_hits: stats.name_hits,
      activity_source,
      unchanged_holdings,
      unmapped_sample: stats.unmapped_sample,
    });

    const parsedIds = await persistInstitutionHoldings({
      queueId,
      primaryUrl,
      baseSha256,
      filerName: resolvedFiler,
      accessionNo: meta.accession_no,
      filedAt: meta.filed_at ?? meta.period_of_report,
      holdings,
      parseMeta,
    });

    await markQueueParsed(queueId);
    logParseOutcome({
      source_type: "sec_13f",
      queue_id: queueId,
      outcome: "parsed",
      path,
      llm_used,
      ticker_count: new Set(holdings.map((h) => h.ticker)).size,
      mapped: holdings.length,
      unmapped: stats.unmapped,
      holdings_parsed: stats.holdings_parsed,
    });
    return {
      processed: true,
      queue_id: queueId,
      parsed_ids: parsedIds,
      ticker_count: new Set(holdings.map((h) => h.ticker)).size,
    };
  } catch (err: any) {
    await failQueueWithBackoff(queueId, err);
    logParseOutcome({
      source_type: "sec_13f",
      queue_id: queueId,
      outcome: "failed",
      error: String(err?.message ?? err).slice(0, 200),
      llm_used: null,
    });
    return { processed: false, reason: "busy", queue_id: queueId };
  }
}
