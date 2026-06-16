import { db } from "../core/db.js";

/** Count queue rows waiting to be parsed for the given source types. */
export async function countPendingQueue(sourceTypes: string[]): Promise<number> {
  if (!sourceTypes.length) return 0;
  const placeholders = sourceTypes.map((_, i) => `$${i + 1}`).join(", ");
  const row = await db.one<{ n: string }>(
    `
    SELECT COUNT(*)::text AS n
    FROM document_queue
    WHERE source_type IN (${placeholders})
      AND status IN ('ready_to_parse', 'queued', 'failed', 'parsing')
      AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    `,
    sourceTypes,
  );
  return Number(row?.n ?? 0) || 0;
}
