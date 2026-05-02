import { db } from "../core/db.js";

const threshold = () => Number(process.env.BOSHA_PAPER_SCORE_MIN ?? 48);
const spikeDelta = () => Number(process.env.BOSHA_PAPER_SPIKE_DELTA ?? 12);
const spikeWindowMin = () => Number(process.env.BOSHA_PAPER_SPIKE_WINDOW_MIN ?? 45);
const minHoursBetweenPapers = () => Number(process.env.BOSHA_PAPER_COOLDOWN_HOURS ?? 6);

async function lastPaperTime(ticker: string) {
  const t = ticker.trim().toUpperCase();
  const row = await db.one<{ at: string | null }>(
    `SELECT max(created_at)::timestamptz AS at FROM bosha_papers WHERE ticker = $1`,
    [t],
  );
  return row?.at ? new Date(row.at) : null;
}

/**
 * Paper is assembled only from stored structured rows (events, relationships, score).
 */
export async function buildStructuredPaper(ticker: string) {
  const t = ticker.trim().toUpperCase();
  const st = await db.one<{ score: string; components: unknown }>(
    `SELECT score::text, components FROM bosha_ticker_state WHERE ticker = $1 LIMIT 1`,
    [t],
  );
  const score = st?.score != null ? Number(st.score) : 0;

  const events = await db.query<{ summary: string; kind: string; created_at: string; magnitude: number; novelty: number; sentiment: number }>(
    `
    SELECT summary, kind, created_at::text, magnitude, novelty, sentiment
    FROM bosha_events
    WHERE ticker = $1
    ORDER BY created_at DESC
    LIMIT 12
    `,
    [t],
  );

  const rels = await db.query<{ rel_type: string; confidence: string; from_ticker: string | null; to_ticker: string | null }>(
    `
    SELECT r.rel_type, r.confidence::text,
           fe.ticker AS from_ticker, te.ticker AS to_ticker
    FROM bosha_relationships r
    JOIN bosha_entities fe ON fe.id = r.from_entity_id
    JOIN bosha_entities te ON te.id = r.to_entity_id
    WHERE fe.ticker = $1 OR te.ticker = $1
    ORDER BY r.created_at DESC
    LIMIT 8
    `,
    [t],
  );

  const title =
    events.length > 0
      ? `${t}: ${events[0]!.summary.slice(0, 80)}${events[0]!.summary.length > 80 ? "…" : ""}`
      : `${t}: Bosha signal refresh`;

  const thesisParts: string[] = [];
  if (events.length) {
    thesisParts.push(
      `Latest structured signals (${events.length} items) center on ${events[0]!.kind}: ${events[0]!.summary}.`,
    );
  } else {
    thesisParts.push(`No Bosha-extracted events are on file yet for ${t}; score reflects cross-dataset and graph hints.`);
  }
  thesisParts.push(`Composite score ${score.toFixed(1)} combines recent Bosha extractions with insider, pharma, and politician feeds.`);

  const key_points: string[] = [];
  for (const e of events.slice(0, 5)) {
    key_points.push(`[${e.kind}] ${e.summary}`);
  }
  for (const r of rels) {
    const a = r.from_ticker ?? "?";
    const b = r.to_ticker ?? "?";
    key_points.push(`${r.rel_type} (${Number(r.confidence).toFixed(2)}): ${a} → ${b}`);
  }

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
  const win = spikeWindowMin();

  const prev = await db.one<{ s: string | null }>(
    `
    SELECT score::text AS s FROM bosha_score_log
    WHERE ticker = $1 AND recorded_at <= now() - ($2 || ' minutes')::interval
    ORDER BY recorded_at DESC
    LIMIT 1
    `,
    [t, String(win)],
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
  const trigger =
    crossed && spiked
      ? "threshold_and_spike"
      : crossed
        ? "score_threshold"
        : "short_horizon_spike";

  await db.query(
    `
    INSERT INTO bosha_papers (ticker, title, thesis, key_points, score, trigger_reason)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6)
    `,
    [t, body.title, body.thesis, JSON.stringify(body.key_points), body.score, trigger],
  );

  return { emitted: true as const, trigger };
}
