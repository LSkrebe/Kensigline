import { createHash } from "node:crypto";
import { compactPharmaTextForLlm } from "../../core/sec-llm-text.js";
import { sha256NormalizedText } from "../../core/text-hash.js";
import { db } from "../../core/db.js";
import { llmChat } from "../../core/llm.js";
import { fetchFilingPrimaryText } from "../../core/sec.js";
import { fetchSecJson } from "../../core/sec.js";

type ParseNextResult =
  | { processed: false; reason: "no_work" }
  | { processed: false; reason: "busy"; queue_id: string }
  | { processed: false; reason: "skipped"; queue_id: string; skip_reason: string }
  | { processed: true; queue_id: string; parsed_ids: string[]; inserted: number };

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
    const s2 = raw.indexOf("[");
    const e2 = raw.lastIndexOf("]");
    if (s2 >= 0 && e2 > s2) return JSON.parse(raw.slice(s2, e2 + 1));
    throw new Error("llm_output_not_json");
  }
}

function iso(ts: any): string | null {
  const d = new Date(String(ts ?? ""));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizePhase(p: any): string | null {
  const s = String(p ?? "").trim();
  if (!s) return null;
  if (/III/i.test(s) || /\b3\b/.test(s)) return "III";
  if (/II/i.test(s) || /\b2\b/.test(s)) return "II";
  if (/\bI\b/i.test(s) || /\b1\b/.test(s)) return "I";
  return s.toUpperCase();
}

function isTrialEvent(x: any) {
  return (
    x &&
    typeof x === "object" &&
    typeof x.feed_label === "string" &&
    typeof x.ticker === "string" &&
    (typeof x.event_at === "string" || x.event_at == null)
  );
}

function normalizeEventType(t: any): string {
  const s = String(t ?? "").trim().toUpperCase();
  if (!s) return "PROGRESS";
  if (s === "RESULT" || s === "READOUT" || s === "ENDPOINT MISS") return "RESULT";
  if (s === "REGULATORY") return "REGULATORY";
  if (s === "SAFETY") return "SAFETY";
  if (s === "FINANCING") return "FINANCING";
  if (s === "PARTNERING") return "PARTNERING";
  return s;
}

function importanceFromPhase(phase: string | null) {
  const p = String(phase ?? "").toUpperCase();
  if (p.includes("III")) return "Lead";
  if (p.includes("II")) return "Core";
  if (p.includes("I")) return "Early";
  return "Early";
}

function pharmaFeedLabelFrom(phase: string | null, eventType: string) {
  const p = normalizePhase(phase);
  if (!p) return null;
  const imp = importanceFromPhase(p);
  const et = normalizeEventType(eventType);
  const state = et === "RESULT" ? "Result" : "Progress";
  return `${imp} ${p} ${state}`;
}

function buildPharmaExtractionPrompt(args: { ticker: string; companyName?: string | null; filingText: string }) {
  const { ticker, companyName, filingText } = args;
  return [
    {
      role: "system" as const,
      content: [
        "You extract important pharma pipeline events from SEC filings into structured JSON.",
        "Return ONLY valid JSON. No markdown. If unknown, use null. Do not invent facts.",
        "feed_label: 4–12 word headline. worksheet.analysis: 1–2 dense sentences.",
        "Only output material events with identifiable phase (I/II/III) and update type.",
        "If no phase, return zero events — no generic 'Pipeline update' filler.",
        `Schema: ${JSON.stringify({
          schema_type: "trial_event_batch",
          schema_version: "v2",
          ticker: "string",
          company_name: "string|null",
          events: [
            {
              schema_type: "trial_event",
              schema_version: "v2",
              ticker: "string",
              company_name: "string|null",
              drug: "string|null",
              indication: "string|null",
              phase: "I|II|III|string|null",
              event_type: "RESULT|PROGRESS|REGULATORY|SAFETY|FINANCING|PARTNERING|string",
              event_at: "string|null",
              feed_label: "string",
              context_sentences: ["string"],
              worksheet: { analysis: "string" },
            },
          ],
        })}`,
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [
        "INPUT:",
        JSON.stringify({ ticker, company_name: companyName ?? null }),
        "",
        "FILING TEXT:",
        compactPharmaTextForLlm(filingText, 120_000),
      ].join("\n"),
    },
  ];
}

function looksPharmaRelevant(text: string) {
  const t = text.toLowerCase();
  return (
    t.includes("clinical trial") ||
    t.includes("phase i") ||
    t.includes("phase ii") ||
    t.includes("phase iii") ||
    t.includes("ph i") ||
    t.includes("ph ii") ||
    t.includes("ph iii") ||
    t.includes("enrollment") ||
    t.includes("topline") ||
    t.includes("endpoint") ||
    t.includes("fda") ||
    t.includes("ind ") ||
    t.includes("nda") ||
    t.includes("bla") ||
    t.includes("safety") ||
    t.includes("adverse event") ||
    t.includes("study completion") ||
    t.includes("primary completion") ||
    t.includes("data readout")
  );
}

function cikFromIndexUrl(indexUrl: string) {
  // https://www.sec.gov/Archives/edgar/data/<cik>/<accessionNoDash>/index.json
  const m = String(indexUrl ?? "").match(/\/Archives\/edgar\/data\/(\d+)\//i);
  if (!m) return null;
  const cikNum = Number(m[1]);
  if (!Number.isFinite(cikNum)) return null;
  return String(cikNum).padStart(10, "0");
}

async function resolveTickerFromCik(cik10: string): Promise<{ ticker: string | null; name: string | null }> {
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

type SubMeta = { ticker: string | null; name: string | null; sic: string | null };
const subCache = new Map<string, SubMeta>();

async function fetchSubMeta(cik10: string): Promise<SubMeta> {
  const cached = subCache.get(cik10);
  if (cached) return cached;
  try {
    const subs = (await fetchSecJson(`https://data.sec.gov/submissions/CIK${cik10}.json`)) as any;
    const tickers = Array.isArray(subs?.tickers) ? subs.tickers : [];
    const ticker = tickers.length ? String(tickers[0]).trim().toUpperCase() : null;
    const name = subs?.name ? String(subs.name) : null;
    const sicRaw = subs?.sic != null ? String(subs.sic).trim() : null;
    const sic = sicRaw && /^\d{4}$/.test(sicRaw) ? sicRaw : sicRaw ? sicRaw.padStart(4, "0") : null;
    const out = { ticker, name, sic };
    subCache.set(cik10, out);
    return out;
  } catch {
    const out = { ticker: null, name: null, sic: null };
    subCache.set(cik10, out);
    return out;
  }
}

function isLikelyBiopharmaSic(sic: string | null) {
  if (!sic) return false;
  // Common biopharma + biotech R&D SICs.
  // 2833: Medicinal Chemicals and Botanical Products
  // 2834: Pharmaceutical Preparations
  // 2835: In Vitro & In Vivo Diagnostic Substances
  // 2836: Biological Products (No Diagnostic Substances)
  // 8731: Commercial Physical & Biological Research
  const s = String(sic);
  return s === "2833" || s === "2834" || s === "2835" || s === "2836" || s === "8731";
}

export async function parseNextPharmaQueueItem(): Promise<ParseNextResult> {
  const next = await db.one<{ id: string; url: string; source_type: string; company_id: string | null }>(
    `
    UPDATE document_queue
    SET status = 'parsing', updated_at = now()
    WHERE id = (
      SELECT id
      FROM document_queue
      WHERE status IN ('ready_to_parse', 'queued', 'failed')
        AND source_type IN ('sec_pharma_filing', 'sec_filing')
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, url, source_type, company_id
    `,
  );
  if (!next) return { processed: false, reason: "no_work" };

  const queueId = next.id;
  const indexUrl = next.url;
  const companyId = next.company_id ?? null;

  try {
    const { url: primaryUrl, text } = await fetchFilingPrimaryText(indexUrl);
    const contentSha = sha256NormalizedText(text);
    const filingNow = new Date().toISOString();

    // Cheap filter to avoid spending LLM calls on non-pharma filings.
    if (!looksPharmaRelevant(text.slice(0, 200_000))) {
      await db.query(
        `
        UPDATE document_queue
        SET status = 'dead',
            last_error = 'skipped_not_pharma_relevant',
            next_attempt_at = NULL,
            updated_at = now()
        WHERE id = $1
        `,
        [queueId],
      );
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "not_pharma_relevant" };
    }

    const co = companyId
      ? await db.one<{ ticker: string | null; name: string }>(`SELECT ticker, name FROM companies WHERE id = $1 LIMIT 1`, [
          companyId,
        ])
      : null;
    const hintedTicker = co?.ticker ? String(co.ticker).trim().toUpperCase() : null;
    const hintedName = co?.name ? String(co.name) : null;

    const cik10 = hintedTicker ? null : cikFromIndexUrl(indexUrl);
    const meta = !hintedTicker && cik10 ? await fetchSubMeta(cik10) : null;
    // SIC gating: keep misses low by allowing known biopharma SICs, otherwise require strong pharma text (already true).
    // If SIC exists and is NOT biopharma, skip to avoid LLM spend/noise.
    if (meta?.sic && !isLikelyBiopharmaSic(meta.sic)) {
      await db.query(
        `
        UPDATE document_queue
        SET status = 'dead',
            last_error = 'skipped_non_biopharma_sic',
            next_attempt_at = NULL,
            updated_at = now()
        WHERE id = $1
        `,
        [queueId],
      );
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "non_biopharma_sic" };
    }

    const tickerForPrompt = hintedTicker ?? meta?.ticker ?? "—";
    const nameForPrompt = hintedName ?? meta?.name ?? null;

    const messages = buildPharmaExtractionPrompt({
      ticker: tickerForPrompt,
      companyName: nameForPrompt,
      filingText: text,
    });
    const { content, model } = await llmChat(messages, { temperature: 0, max_tokens: 1200, log_context: "pharma/extract" });
    const out = extractJsonObject(content);

    const events = Array.isArray(out?.events) ? out.events : [];
    const parsed_ids: string[] = [];
    let inserted = 0;

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!isTrialEvent(e)) continue;
      const ticker = String(e.ticker ?? "").trim().toUpperCase() || (meta?.ticker ?? hintedTicker ?? null);
      const eventAt = iso(e.event_at) ?? filingNow;

      const ws = e.worksheet ?? {};
      const drug = e.drug != null ? String(e.drug) : null;
      const indication = e.indication != null ? String(e.indication) : null;
      const phase = normalizePhase(e.phase ?? null);
      const eventType = normalizeEventType(e.event_type ?? e.eventType ?? null);
      let analysis = typeof ws?.analysis === "string" ? ws.analysis.trim() : "";
      if (!analysis && Array.isArray(e.context_sentences)) {
        analysis = e.context_sentences
          .map((s: unknown) => String(s ?? "").trim())
          .filter(Boolean)
          .join("\n\n");
      }
      if (!analysis) continue;
      const phaseLabel = pharmaFeedLabelFrom(phase, eventType);
      const headline = String(e.feed_label ?? "")
        .trim()
        .replace(/\s+/g, " ");
      const companyName = e.company_name != null ? String(e.company_name) : nameForPrompt;

      // If we couldn't derive a real label (no phase), skip inserting this event.
      if (!phaseLabel || headline.length < 8) continue;

      const perEventSha = createHash("sha256")
        .update(contentSha + ":" + String(i) + ":" + JSON.stringify(e).slice(0, 2000), "utf8")
        .digest("hex");

      const sourceKey =
        String(primaryUrl ?? "").includes("clinicaltrials.gov") || String(e.nct_id ?? "").trim()
          ? "ClinicalTrials.gov"
          : eventType === "registry"
            ? "ClinicalTrials.gov"
            : "8-K";

      const r = await db.one<{ id: string }>(
        `
        INSERT INTO documents (
          queue_id,
          doc_kind,
          schema_version,
          ticker,
          feed_kind,
          source_key,
          analysis,
          event_at,
          feed_label,
          title,
          program_drug,
          program_indication,
          program_phase,
          url,
          published_at,
          content_sha256,
          data
        )
        VALUES (
          $1,
          'trial_event',
          'v2',
          $2,
          'pharma',
          $12,
          $13,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $14
        )
        ON CONFLICT (content_sha256) WHERE content_sha256 IS NOT NULL
        DO UPDATE SET parsed_at = now()
        RETURNING id
        `,
        [
          queueId,
          ticker,
          eventAt,
          phaseLabel,
          headline,
          drug,
          indication,
          phase,
          primaryUrl,
          eventAt,
          perEventSha,
          sourceKey,
          analysis,
          {
            ...e,
            event_type: eventType,
            sponsor: companyName,
            worksheet: { analysis },
          },
        ],
      );
      if (r?.id) {
        parsed_ids.push(r.id);
        inserted += 1;
      }
    }

    if (inserted <= 0) {
      await db.query(
        `
        UPDATE document_queue
        SET status = 'dead',
            last_error = 'pharma_no_events_extracted',
            next_attempt_at = NULL,
            updated_at = now()
        WHERE id = $1
        `,
        [queueId],
      );
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "no_events" };
    } else {
      await db.query(
        `
        UPDATE document_queue
        SET status = 'parsed', updated_at = now(), last_error = NULL
        WHERE id = $1
        `,
        [queueId],
      );
    }

    return { processed: true, queue_id: queueId, parsed_ids, inserted };
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

