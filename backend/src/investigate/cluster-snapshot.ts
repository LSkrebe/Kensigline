import { db } from "../core/db.js";

type ClusterSnapshotRow = {
  feed_kind: string;
  ticker_norm: string;
  days: number;
  payload: Record<string, unknown>;
  updated_at: string;
};

let tableReady: Promise<void> | null = null;

export async function ensureClusterSnapshotTable(): Promise<void> {
  if (!tableReady) {
    tableReady = db
      .query(
        `
        CREATE TABLE IF NOT EXISTS feed_cluster_snapshot (
          feed_kind text NOT NULL,
          ticker_norm text NOT NULL,
          days int NOT NULL,
          payload jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (feed_kind, ticker_norm, days)
        )
        `,
      )
      .then(() => undefined)
      .catch((e) => {
        tableReady = null;
        throw e;
      });
  }
  await tableReady;
}

export async function readClusterSnapshot(args: {
  feedKind: string;
  ticker: string;
  days: number;
  /** Reject if older than this many minutes (default 6h). */
  maxAgeMinutes?: number;
}): Promise<Record<string, unknown> | null> {
  await ensureClusterSnapshotTable();
  const t = String(args.ticker ?? "").trim().toUpperCase();
  if (!t) return null;
  const maxAge = Math.max(5, Math.min(24 * 60, args.maxAgeMinutes ?? 360));
  const row = await db.oneApi<ClusterSnapshotRow>(
    `
    SELECT feed_kind, ticker_norm, days, payload, updated_at::text
    FROM feed_cluster_snapshot
    WHERE feed_kind = $1
      AND ticker_norm = $2
      AND days = $3
      AND updated_at >= now() - ($4 || ' minutes')::interval
    LIMIT 1
    `,
    [args.feedKind, t, args.days, String(maxAge)],
  );
  if (!row?.payload || typeof row.payload !== "object") return null;
  return row.payload as Record<string, unknown>;
}

export async function writeClusterSnapshot(args: {
  feedKind: string;
  ticker: string;
  days: number;
  payload: Record<string, unknown>;
}): Promise<void> {
  await ensureClusterSnapshotTable();
  const t = String(args.ticker ?? "").trim().toUpperCase();
  if (!t) return;
  await db.query(
    `
    INSERT INTO feed_cluster_snapshot (feed_kind, ticker_norm, days, payload, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, now())
    ON CONFLICT (feed_kind, ticker_norm, days) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = now()
    `,
    [args.feedKind, t, args.days, JSON.stringify(args.payload)],
  );
}
