import { db } from "../../core/db.js";
import { llmChat } from "../../core/llm.js";
import { buildStructuredPaper } from "./paper.js";

const DAYS = 30;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function safeJsonParse(txt: string) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

async function llmScoreForTicker(ticker: string, baseline: number) {
  const t = ticker.trim().toUpperCase();
  const paper = await buildStructuredPaper(t);

  const sys =
    "You are an investment research assistant. You must return STRICT JSON only. " +
    "Score represents 'expected risk-adjusted opportunity' over the next 30-90 days. " +
    "Use the structured signals and be conservative. Do not add commentary.";

  const user = JSON.stringify(
    {
      ticker: t,
      baseline_score_0_100: baseline,
      structured: {
        title: paper.title,
        thesis: paper.thesis,
        key_points: paper.key_points.slice(0, 8),
      },
      output_schema: {
        score: "number 0-100",
        direction: "'long'|'short'|'neutral'",
        confidence: "number 0-1",
        rationale_short: "string <= 140 chars",
      },
    },
    null,
    2,
  );

  const { content, model } = await llmChat(
    [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
    { temperature: 0.2, max_tokens: 400, response_format: "json_object" },
  );

  const json = safeJsonParse(content);
  const score = Number(json?.score);
  const direction = String(json?.direction ?? "neutral");
  const confidence = Number(json?.confidence);
  const rationale_short = String(json?.rationale_short ?? "").slice(0, 140);

  return {
    llm_ok: Number.isFinite(score),
    llm_score: Number.isFinite(score) ? clamp(score, 0, 100) : null,
    llm_direction: ["long", "short", "neutral"].includes(direction) ? direction : "neutral",
    llm_confidence: Number.isFinite(confidence) ? clamp(confidence, 0, 1) : null,
    llm_rationale: rationale_short,
    llm_model: model,
    raw: content,
  };
}

export async function loadCrossDatasetSignals(ticker: string) {
  const t = ticker.trim().toUpperCase();
  const insider = await db.one<{ c: string }>(
    `
    SELECT COUNT(*)::text AS c FROM documents
    WHERE feed_kind = 'insider' AND ticker = $1
      AND event_at IS NOT NULL AND event_at >= now() - ($2 || ' days')::interval
    `,
    [t, String(DAYS)],
  );
  const pharma = await db.one<{ c: string }>(
    `
    SELECT COUNT(*)::text AS c FROM documents
    WHERE feed_kind = 'pharma' AND ticker = $1
      AND event_at IS NOT NULL AND event_at >= now() - ($2 || ' days')::interval
    `,
    [t, String(DAYS)],
  );
  const politicians = await db.one<{ c: string }>(
    `
    SELECT COUNT(*)::text AS c FROM documents
    WHERE feed_kind = 'politicians' AND ticker = $1
      AND event_at IS NOT NULL AND event_at >= now() - ($2 || ' days')::interval
    `,
    [t, String(DAYS)],
  );
  return {
    insider_30d: Number(insider?.c ?? 0) || 0,
    pharma_30d: Number(pharma?.c ?? 0) || 0,
    politicians_30d: Number(politicians?.c ?? 0) || 0,
  };
}

export async function sumResearchDocSignal(ticker: string, days = 14) {
  const t = ticker.trim().toUpperCase();
  const row = await db.one<{ c: string | null; w: string | null }>(
    `
    SELECT COUNT(*)::text AS c,
           COALESCE(SUM(
             LEAST(25, 4 + length(trim(analysis)) / 120.0)
           ), 0)::text AS w
    FROM documents
    WHERE upper(trim(ticker)) = $1
      AND feed_kind = 'research'
      AND show_on_ticker = true
      AND analysis IS NOT NULL
      AND parsed_at >= now() - ($2 || ' days')::interval
    `,
    [t, String(days)],
  );
  const count = Number(row?.c ?? 0) || 0;
  const weight = Number(row?.w ?? 0) || 0;
  return Math.min(40, weight + count * 2);
}

export async function computeScoreForTicker(ticker: string): Promise<{ score: number; components: Record<string, any> }> {
  const t = ticker.trim().toUpperCase();
  const cross = await loadCrossDatasetSignals(t);
  const researchRaw = await sumResearchDocSignal(t, 14);

  const crossPts =
    clamp(Math.log(1 + cross.insider_30d) * 4, 0, 12) +
    clamp(Math.log(1 + cross.pharma_30d) * 5, 0, 15) +
    clamp(Math.log(1 + cross.politicians_30d) * 4, 0, 12);

  const raw = clamp(researchRaw + crossPts, 0, 100);
  const baseline = Math.round(raw * 10) / 10;

  let score = baseline;
  const components: Record<string, any> = {
    research_docs_14d: researchRaw,
    cross_insider_log: clamp(Math.log(1 + cross.insider_30d) * 4, 0, 12),
    cross_pharma_log: clamp(Math.log(1 + cross.pharma_30d) * 5, 0, 15),
    cross_politicians_log: clamp(Math.log(1 + cross.politicians_30d) * 4, 0, 12),
    baseline_score: baseline,
  };

  try {
    const llm = await llmScoreForTicker(t, baseline);
    if (llm.llm_ok && llm.llm_score != null) {
      score = Math.round(Math.max(baseline, llm.llm_score) * 10) / 10;
      components.llm_score = llm.llm_score;
      components.score_final = score;
    }
    components.llm_ok = llm.llm_ok;
    components.llm_model = llm.llm_model;
    components.llm_direction = llm.llm_direction;
    components.llm_confidence = llm.llm_confidence;
    components.llm_rationale = llm.llm_rationale;
  } catch {
    // Ignore LLM failures; baseline remains.
  }

  return { score, components };
}

export async function saveTickerState(ticker: string, score: number, components: Record<string, any>) {
  const t = ticker.trim().toUpperCase();
  await db.query(
    `
    INSERT INTO ticker_feed_state (ticker, score, components, updated_at)
    VALUES ($1, $2, $3::jsonb, now())
    ON CONFLICT (ticker) DO UPDATE SET
      score = EXCLUDED.score,
      components = EXCLUDED.components,
      updated_at = now()
    `,
    [t, score, JSON.stringify(components)],
  );
}
