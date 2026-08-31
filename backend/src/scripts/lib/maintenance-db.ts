import pg from "pg";

/** Session pooler (5432) — avoids transaction-pool timeouts on long maintenance. */
export function maintenanceDatabaseUrl(): string {
  const raw = String(process.env.DATABASE_URL ?? "").trim();
  if (!raw) throw new Error("DATABASE_URL is required");
  return raw.replace(":6543/", ":5432/");
}

export function createMaintenancePool(max = 3): pg.Pool {
  return new pg.Pool({ connectionString: maintenanceDatabaseUrl(), max: Math.max(1, max) });
}

export async function prepareMaintenanceClient(client: pg.PoolClient): Promise<void> {
  await client.query("SET statement_timeout = 0");
}

export async function withMaintenanceClient<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const pool = createMaintenancePool(1);
  const client = await pool.connect();
  try {
    await prepareMaintenanceClient(client);
    return await fn(client);
  } finally {
    client.release();
    await pool.end();
  }
}

/** Run async work over items with a fixed concurrency limit. */
export async function mapPoolLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Math.min(Math.max(1, limit), items.length);

  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}
