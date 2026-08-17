import { db, workerDbLoad } from "../core/db.js";
import { ingestMode, ingestModeSummary } from "./ingest-mode.js";

export type QueueStatusCount = { status: string; count: number; capped: boolean };

/** Index-friendly capped count — never full-table seq scan. */
async function countByStatus(sourceType: string, status: string, cap = 10_001): Promise<{ count: number; capped: boolean }> {
  const row = await db.oneApi<{ n: string }>(
    `
    SELECT COUNT(*)::text AS n
    FROM (
      SELECT 1
      FROM document_queue
      WHERE source_type = $1 AND status = $2
      LIMIT $3
    ) t
    `,
    [sourceType, status, cap],
    12_000,
  );
  const count = Number(row?.n ?? 0) || 0;
  return { count, capped: count >= cap - 1 };
}

export async function getIngestQueueSnapshot(sourceType = "sec_13f") {
  const statuses = ["ready_to_parse", "parsing", "parsed", "dead", "failed", "queued"] as const;
  const counts: QueueStatusCount[] = [];
  for (const status of statuses) {
    const { count, capped } = await countByStatus(sourceType, status);
    if (count > 0 || status === "ready_to_parse" || status === "parsing") {
      counts.push({ status, count, capped });
    }
  }
  const ready = counts.find((c) => c.status === "ready_to_parse")?.count ?? 0;
  const parsing = counts.find((c) => c.status === "parsing")?.count ?? 0;
  return {
    source_type: sourceType,
    mode: ingestMode(),
    mode_summary: ingestModeSummary(),
    worker_db: workerDbLoad(),
    queue: counts,
    backlog_ready: ready,
    in_flight_parsing: parsing,
    at: new Date().toISOString(),
  };
}
