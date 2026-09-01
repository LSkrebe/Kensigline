import { db } from "../core/db.js";

const SNAPSHOT_KEY = "home_v1";

export type ExploreHomeSnapshotPayload = {
  recap: unknown;
  directory: unknown;
  recapEvaluated: unknown;
};

type SnapshotRow = {
  cache_key: string;
  payload: ExploreHomeSnapshotPayload;
  updated_at: string;
};

let tableReady: Promise<void> | null = null;

export async function ensureExploreHomeSnapshotTable(): Promise<void> {
  if (!tableReady) {
    tableReady = db
      .queryApi(
        `
        CREATE TABLE IF NOT EXISTS explore_home_snapshot (
          cache_key text PRIMARY KEY,
          payload jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
        `,
        [],
        12_000,
      )
      .then(() => undefined)
      .catch((e) => {
        tableReady = null;
        throw e;
      });
  }
  await tableReady;
}

/** Load durable explore/home snapshot — survives API restarts. */
export async function readExploreHomeSnapshot(
  maxAgeMs: number,
): Promise<{ at: number; payload: ExploreHomeSnapshotPayload } | null> {
  await ensureExploreHomeSnapshotTable();
  const maxAgeMin = Math.max(1, Math.ceil(maxAgeMs / 60_000));
  const row = await db.oneApi<SnapshotRow>(
    `
    SELECT cache_key, payload, updated_at::text
    FROM explore_home_snapshot
    WHERE cache_key = $1
      AND updated_at >= now() - ($2 || ' minutes')::interval
    LIMIT 1
    `,
    [SNAPSHOT_KEY, String(maxAgeMin)],
    8_000,
  );
  if (!row?.payload || typeof row.payload !== "object") return null;
  const at = Date.parse(row.updated_at);
  if (!Number.isFinite(at)) return null;
  return { at, payload: row.payload as ExploreHomeSnapshotPayload };
}

export async function writeExploreHomeSnapshot(payload: ExploreHomeSnapshotPayload): Promise<void> {
  await ensureExploreHomeSnapshotTable();
  await db.queryApi(
    `
    INSERT INTO explore_home_snapshot (cache_key, payload, updated_at)
    VALUES ($1, $2::jsonb, now())
    ON CONFLICT (cache_key) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = now()
    `,
    [SNAPSHOT_KEY, JSON.stringify(payload)],
    12_000,
  );
}
