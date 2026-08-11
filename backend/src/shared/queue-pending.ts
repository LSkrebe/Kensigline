import { db } from "../core/db.js";

/**
 * Cheap low-water probe: only scan up to `threshold + 1` rows via the claim index.
 * Full COUNT(*) on document_queue times out under load and starves backfill.
 */
export async function readyQueueAbove(sourceTypes: string[], threshold: number): Promise<boolean> {
  if (!sourceTypes.length) return false;
  const limit = Math.max(1, Math.min(50_000, Math.floor(threshold) + 1));
  const placeholders = sourceTypes.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.query<{ one: number }>(
    `
    SELECT 1 AS one
    FROM document_queue
    WHERE source_type IN (${placeholders})
      AND status IN ('ready_to_parse', 'queued', 'failed')
      AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    LIMIT $${sourceTypes.length + 1}
    `,
    [...sourceTypes, limit],
  );
  return rows.length > threshold;
}

/** Count queue rows waiting to be parsed for the given source types. */
export async function countPendingQueue(sourceTypes: string[]): Promise<number> {
  if (!sourceTypes.length) return 0;
  const placeholders = sourceTypes.map((_, i) => `$${i + 1}`).join(", ");
  const row = await db.one<{ n: string }>(
    `
    SELECT COUNT(*)::text AS n
    FROM (
      SELECT 1
      FROM document_queue
      WHERE source_type IN (${placeholders})
        AND status IN ('ready_to_parse', 'queued', 'failed', 'parsing')
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      LIMIT 10001
    ) t
    `,
    sourceTypes,
  );
  return Number(row?.n ?? 0) || 0;
}

/** Ready/failed only — capped so monitoring never seq-scans the whole queue. */
export async function countReadyQueue(sourceTypes: string[]): Promise<number> {
  if (!sourceTypes.length) return 0;
  const placeholders = sourceTypes.map((_, i) => `$${i + 1}`).join(", ");
  const row = await db.one<{ n: string }>(
    `
    SELECT COUNT(*)::text AS n
    FROM (
      SELECT 1
      FROM document_queue
      WHERE source_type IN (${placeholders})
        AND status IN ('ready_to_parse', 'queued', 'failed')
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      LIMIT 10001
    ) t
    `,
    sourceTypes,
  );
  return Number(row?.n ?? 0) || 0;
}
