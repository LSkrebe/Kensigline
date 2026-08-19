import { db } from "../core/db.js";
import { planQueueRetry } from "./queue-retry.js";

export type QueueClaim = { id: string; url: string; source_type?: string };

export function isPoolBlipError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err);
  return /ECHECKOUTTIMEOUT|EMAXCONNSESSION|too many clients|authentication did not complete|connection terminated|08006|timeout/i.test(
    msg,
  );
}

/** Re-queue after pool checkout blip — do not burn parse attempts/backoff. */
export async function requeuePoolBlip(queueId: string, err: unknown): Promise<void> {
  const msg = String((err as { message?: string })?.message ?? err).slice(0, 2000);
  await db.query(
    `
    UPDATE document_queue
    SET status = 'ready_to_parse',
        last_error = $2,
        next_attempt_at = now() + interval '3 seconds',
        updated_at = now()
    WHERE id = $1
    `,
    [queueId, `pool_blip: ${msg}`],
  );
}

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
  if (isPoolBlipError(err)) {
    await requeuePoolBlip(queueId, err);
    return "failed";
  }
  const msg = String((err as any)?.message ?? err);
  const plan = planQueueRetry(1, msg);
  if (plan.permanent) {
    await markQueueDead(queueId, msg);
    return "dead";
  }
  const attempts = await db.one<{ attempts: number }>(
    `UPDATE document_queue SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
    [queueId],
  );
  const n = attempts?.attempts ?? 1;
  const retry = planQueueRetry(n, msg);
  const status = n >= retry.maxAttempts ? "dead" : "failed";
  await db.query(
    `
    UPDATE document_queue
    SET status = $2, last_error = $3, next_attempt_at = now() + ($4 || ' seconds')::interval, updated_at = now()
    WHERE id = $1
    `,
    [queueId, status, msg.slice(0, 2000), String(retry.delaySec)],
  );
  return status;
}

/**
 * Crash/kill can leave rows stuck in `parsing` forever (claim never picks them).
 * Reset stale ones to failed so workers reclaim them.
 */
export async function reclaimStaleParsing(opts?: {
  olderThanMinutes?: number;
  sourceTypes?: string[];
}): Promise<number> {
  const minutes = Math.max(1, Math.min(24 * 60, Math.floor(opts?.olderThanMinutes ?? 10)));
  const sourceTypes = opts?.sourceTypes?.filter(Boolean) ?? [];
  const sourceFilter =
    sourceTypes.length > 0
      ? `AND source_type IN (${sourceTypes.map((_, i) => `$${i + 2}`).join(", ")})`
      : "";
  const rows = await db.query<{ id: string }>(
    `
    UPDATE document_queue
    SET status = 'failed',
        last_error = 'reclaimed_stale_parsing',
        next_attempt_at = now(),
        updated_at = now()
    WHERE id IN (
      SELECT id
      FROM document_queue
      WHERE status = 'parsing'
        AND updated_at < now() - ($1 || ' minutes')::interval
        ${sourceFilter}
      ORDER BY updated_at ASC
      LIMIT 200
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
    `,
    [String(minutes), ...sourceTypes],
  );
  return rows.length;
}

/**
 * Requeue dead rows that look transient (network/rate/timeout) — not permanent parse poison.
 * Caps attempts so we don't infinite-loop.
 */
export async function requeueTransientDead(opts?: { limit?: number }): Promise<number> {
  const limit = Math.max(1, Math.min(2000, Math.floor(opts?.limit ?? 100)));
  const rows = await db.query<{ id: string }>(
    `
    UPDATE document_queue
    SET status = 'ready_to_parse',
        attempts = LEAST(attempts, 3),
        next_attempt_at = now(),
        last_error = left(coalesce(last_error,'') || ' | requeued_transient', 2000),
        updated_at = now()
    WHERE id IN (
      SELECT id
      FROM document_queue
      WHERE status = 'dead'
        AND attempts < 12
        AND last_error NOT ILIKE 'permanent_404:%'
        AND last_error NOT ILIKE '%sec_fetch_failed 404%'
        AND (
          -- Network / SEC / pooler only. Do NOT requeue Postgres statement timeouts —
          -- that creates a death spiral when the DB is already overloaded.
          last_error ILIKE '%ECHECKOUT%'
          OR last_error ILIKE '%ECONN%'
          OR last_error ILIKE '%ETIMEDOUT%'
          OR last_error ILIKE '%fetch failed%'
          OR last_error ILIKE '%fetch_failed%'
          OR last_error ILIKE '%network%'
          OR last_error ILIKE '%socket%'
          OR last_error ILIKE '%503%'
          OR last_error ILIKE '%502%'
          OR last_error ILIKE '%too many clients%'
          OR last_error ILIKE '%remaining connection%'
          OR last_error ILIKE '%authentication did not complete%'
          OR (last_error ILIKE '%timeout%' AND last_error NOT ILIKE '%statement timeout%')
          OR (last_error ILIKE '%reclaimed_stale%' AND last_error NOT ILIKE '%statement timeout%')
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
