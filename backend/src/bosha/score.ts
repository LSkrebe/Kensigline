import { db } from "../core/db.js";

const DAYS = 30;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Recent activity counts from existing pipelines (read-only). */
export async function loadCrossDatasetSignals(ticker: string) {
  const t = ticker.trim().toUpperCase();
  const insider = await db.one<{ c: string }>(
    `
    SELECT COUNT(*)::text AS c FROM document_parsed
    WHERE feed_kind = 'insider' AND ticker = $1
      AND feed_at IS NOT NULL AND feed_at >= now() - ($2 || ' days')::interval
    `,
    [t, String(DAYS)],
  );
  const pharma = await db.one<{ c: string }>(
    `
    SELECT COUNT(*)::text AS c FROM document_parsed
    WHERE feed_kind = 'pharma' AND ticker = $1
      AND feed_at IS NOT NULL AND feed_at >= now() - ($2 || ' days')::interval
    `,
    [t, String(DAYS)],
  );
  const politicians = await db.one<{ c: string }>(
    `
    SELECT COUNT(*)::text AS c FROM document_parsed
    WHERE feed_kind = 'politicians' AND ticker = $1
      AND feed_at IS NOT NULL AND feed_at >= now() - ($2 || ' days')::interval
    `,
    [t, String(DAYS)],
  );
  return {
    insider_30d: Number(insider?.c ?? 0) || 0,
    pharma_30d: Number(pharma?.c ?? 0) || 0,
    politicians_30d: Number(politicians?.c ?? 0) || 0,
  };
}

export async function sumBoshaEventSignal(ticker: string, days = 14) {
  const t = ticker.trim().toUpperCase();
  const row = await db.one<{ v: string | null }>(
    `
    SELECT COALESCE(SUM(
      25.0 * LEAST(1, GREATEST(0, magnitude)) * LEAST(1, GREATEST(0, novelty)) * (0.5 + 0.5 * ABS(LEAST(1, GREATEST(-1, sentiment))))
    ), 0)::text AS v
    FROM bosha_events
    WHERE ticker = $1
      AND created_at >= now() - ($2 || ' days')::interval
    `,
    [t, String(days)],
  );
  return Number(row?.v ?? 0) || 0;
}

/** Optional small boost from relationship graph (leak to neighbors). */
export async function relationshipBoost(ticker: string) {
  const t = ticker.trim().toUpperCase();
  const row = await db.one<{ v: string | null }>(
    `
    WITH me AS (SELECT id FROM bosha_entities WHERE ticker = $1 LIMIT 1)
    SELECT COALESCE(SUM(r.confidence * 3.0), 0)::text AS v
    FROM bosha_relationships r
    WHERE (r.from_entity_id = (SELECT id FROM me) OR r.to_entity_id = (SELECT id FROM me))
      AND r.created_at >= now() - '30 days'::interval
    `,
    [t],
  );
  return Math.min(15, Number(row?.v ?? 0) || 0);
}

export async function computeScoreForTicker(ticker: string): Promise<{ score: number; components: Record<string, number> }> {
  const t = ticker.trim().toUpperCase();
  const cross = await loadCrossDatasetSignals(t);
  const boshaRaw = await sumBoshaEventSignal(t, 14);
  const rel = await relationshipBoost(t);

  const crossPts =
    clamp(Math.log(1 + cross.insider_30d) * 4, 0, 12) +
    clamp(Math.log(1 + cross.pharma_30d) * 5, 0, 15) +
    clamp(Math.log(1 + cross.politicians_30d) * 4, 0, 12);

  const raw = clamp(boshaRaw + crossPts + rel, 0, 100);
  const score = Math.round(raw * 10) / 10;

  return {
    score,
    components: {
      bosha_events_14d: boshaRaw,
      cross_insider_log: clamp(Math.log(1 + cross.insider_30d) * 4, 0, 12),
      cross_pharma_log: clamp(Math.log(1 + cross.pharma_30d) * 5, 0, 15),
      cross_politicians_log: clamp(Math.log(1 + cross.politicians_30d) * 4, 0, 12),
      relationship_boost: rel,
    },
  };
}

export async function saveTickerState(ticker: string, score: number, components: Record<string, number>) {
  const t = ticker.trim().toUpperCase();
  await db.query(
    `
    INSERT INTO bosha_ticker_state (ticker, score, components, updated_at)
    VALUES ($1, $2, $3::jsonb, now())
    ON CONFLICT (ticker) DO UPDATE SET
      score = EXCLUDED.score,
      components = EXCLUDED.components,
      updated_at = now()
    `,
    [t, score, JSON.stringify(components)],
  );
  await db.query(`INSERT INTO bosha_score_log (ticker, score) VALUES ($1, $2)`, [t, score]);
}
