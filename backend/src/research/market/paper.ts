import { db } from "../../core/db.js";
import { buildResearchPresentation } from "../../documents/presentation.js";

const threshold = () => Number(process.env.RESEARCH_PAPER_SCORE_MIN ?? process.env.BOSHA_PAPER_SCORE_MIN ?? 48);
const spikeDelta = () => Number(process.env.RESEARCH_PAPER_SPIKE_DELTA ?? process.env.BOSHA_PAPER_SPIKE_DELTA ?? 12);
const minHoursBetweenPapers = () =>
  Number(process.env.RESEARCH_PAPER_COOLDOWN_HOURS ?? process.env.BOSHA_PAPER_COOLDOWN_HOURS ?? 6);

async function lastPaperTime(ticker: string) {
  const t = ticker.trim().toUpperCase();
  const row = await db.one<{ at: string | null }>(
    `SELECT max(created_at)::timestamptz AS at FROM research_memos WHERE ticker = $1`,
    [t],
  );
  return row?.at ? new Date(row.at) : null;
}

export async function buildStructuredPaper(ticker: string) {
  const t = ticker.trim().toUpperCase();
  const st = await db.one<{ score: string }>(
    `SELECT score::text FROM ticker_feed_state WHERE ticker = $1 LIMIT 1`,
    [t],
  );
  const score = st?.score != null ? Number(st.score) : 0;

  const docs = await db.query<{ source_key: string | null; analysis: string | null }>(
    `
    SELECT source_key, analysis
    FROM documents
    WHERE upper(trim(ticker)) = $1
      AND show_on_ticker = true
      AND analysis IS NOT NULL
      AND length(trim(analysis)) > 0
    ORDER BY event_at DESC NULLS LAST, parsed_at DESC
    LIMIT 12
    `,
    [t],
  );

  const title =
    docs[0]?.analysis?.trim()
      ? `${t} — ${docs[0]!.analysis!.slice(0, 72)}${docs[0]!.analysis!.length > 72 ? "…" : ""}`
      : `${t} — document-backed research read`;

  const thesisParts: string[] = [];
  thesisParts.push(
    "This memo is assembled only from stored document analyses and flow rows — not from a relationship graph.",
  );
  if (docs.length) {
    thesisParts.push(`${docs.length} analyzed document${docs.length === 1 ? "" : "s"} on file for ${t}.`);
  } else {
    thesisParts.push(`No analyzed documents on file for ${t} yet.`);
  }
  thesisParts.push(`Research feed score ${score.toFixed(1)} (0–100) blends document velocity with cross-feed overlap.`);

  const key_points = docs.slice(0, 8).map((d) => {
    const src = String(d.source_key ?? "Doc").trim();
    const body = String(d.analysis ?? "").trim();
    return `[${src}] ${body.slice(0, 240)}${body.length > 240 ? "…" : ""}`;
  });

  return {
    ticker: t,
    title: title.slice(0, 300),
    thesis: thesisParts.join(" "),
    key_points,
    score,
  };
}

export async function maybeEmitPaper(ticker: string, newScore: number) {
  const t = ticker.trim().toUpperCase();
  const thr = threshold();
  const sd = spikeDelta();

  const prev = await db.one<{ s: string | null }>(
    `SELECT score::text AS s FROM ticker_feed_state WHERE ticker = $1 LIMIT 1`,
    [t],
  );
  const prevScore = prev?.s != null ? Number(prev.s) : null;

  const crossed = newScore >= thr;
  const spiked = prevScore != null && Number.isFinite(prevScore) && newScore - prevScore >= sd;

  if (!crossed && !spiked) return { emitted: false as const, reason: "below_thresholds" };

  const last = await lastPaperTime(t);
  const cooldownMs = minHoursBetweenPapers() * 3600 * 1000;
  if (last && Date.now() - last.getTime() < cooldownMs && !spiked) {
    return { emitted: false as const, reason: "cooldown" };
  }

  const body = await buildStructuredPaper(t);
  const presentation = await buildResearchPresentation(t);
  const trigger =
    crossed && spiked ? "threshold_and_spike" : crossed ? "score_threshold" : "short_horizon_spike";

  await db.query(
    `
    INSERT INTO research_memos (ticker, title, thesis, key_points, presentation, score, trigger_reason)
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
    `,
    [t, body.title, body.thesis, JSON.stringify(body.key_points), JSON.stringify(presentation), body.score, trigger],
  );

  return { emitted: true as const, trigger };
}
