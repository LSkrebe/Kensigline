import { db } from "../core/db.js";

export type QueueClaim = { id: string; url: string; source_type?: string };

/** Claim next queue row for given source types (SKIP LOCKED). */
export async function claimQueueItem(sourceTypes: string[]): Promise<QueueClaim | null> {
  if (!sourceTypes.length) return null;
  const placeholders = sourceTypes.map((_, i) => `$${i + 1}`).join(", ");
  return db.one<QueueClaim>(
    `
    UPDATE document_queue
    SET status = 'parsing', updated_at = now()
    WHERE id = (
      SELECT id
      FROM document_queue
      WHERE status IN ('ready_to_parse', 'queued', 'failed')
        AND source_type IN (${placeholders})
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, url, source_type
    `,
    sourceTypes,
  );
}

export async function claimQueueItemSingle(sourceType: string): Promise<QueueClaim | null> {
  return claimQueueItem([sourceType]);
}

export async function markQueueParsed(queueId: string, note?: string) {
  await db.query(
    `UPDATE document_queue SET status = 'parsed', updated_at = now(), last_error = $2 WHERE id = $1`,
    [queueId, note ?? null],
  );
}

export async function markQueueDead(queueId: string, reason: string) {
  await db.query(
    `
    UPDATE document_queue
    SET status = 'dead', last_error = $2, next_attempt_at = NULL, updated_at = now()
    WHERE id = $1
    `,
    [queueId, reason.slice(0, 2000)],
  );
}

export async function failQueueWithBackoff(queueId: string, err: unknown): Promise<"failed" | "dead"> {
  const msg = String((err as any)?.message ?? err);
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
  return status;
}

/**
 * Crash/kill can leave rows stuck in `parsing` forever (claim never picks them).
 * Reset stale ones to failed so workers reclaim them.
 */
export async function reclaimStaleParsing(opts?: { olderThanMinutes?: number }): Promise<number> {
  const minutes = Math.max(1, Math.min(24 * 60, Math.floor(opts?.olderThanMinutes ?? 10)));
  const rows = await db.query<{ id: string }>(
    `
    UPDATE document_queue
    SET status = 'failed',
        last_error = 'reclaimed_stale_parsing',
        next_attempt_at = now(),
        updated_at = now()
    WHERE status = 'parsing'
      AND updated_at < now() - ($1 || ' minutes')::interval
    RETURNING id
    `,
    [String(minutes)],
  );
  return rows.length;
}

/**
 * Requeue dead rows that look transient (network/rate/timeout) — not permanent parse poison.
 * Caps attempts so we don't infinite-loop.
 */
export async function requeueTransientDead(opts?: { limit?: number }): Promise<number> {
  const limit = Math.max(1, Math.min(500, Math.floor(opts?.limit ?? 100)));
  const rows = await db.query<{ id: string }>(
    `
    UPDATE document_queue
    SET status = 'failed',
        next_attempt_at = now(),
        last_error = left(coalesce(last_error,'') || ' | requeued_transient', 2000),
        updated_at = now()
    WHERE id IN (
      SELECT id
      FROM document_queue
      WHERE status = 'dead'
        AND attempts < 8
        AND (
          last_error ILIKE '%timeout%'
          OR last_error ILIKE '%ECONN%'
          OR last_error ILIKE '%ETIMEDOUT%'
          OR last_error ILIKE '%429%'
          OR last_error ILIKE '%rate%'
          OR last_error ILIKE '%fetch_failed%'
          OR last_error ILIKE '%network%'
          OR last_error ILIKE '%reclaimed_stale%'
          OR last_error ILIKE '%socket%'
          OR last_error ILIKE '%503%'
          OR last_error ILIKE '%502%'
        )
      ORDER BY updated_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
    `,
    [limit],
  );
  return rows.length;
}
