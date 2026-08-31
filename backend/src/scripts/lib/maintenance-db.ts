import pg from "pg";

/** Session pooler (5432) — avoids transaction-pool timeouts on long maintenance. */
export function maintenanceDatabaseUrl(): string {
  const raw = String(process.env.DATABASE_URL ?? "").trim();
  if (!raw) throw new Error("DATABASE_URL is required");
  return raw.replace(":6543/", ":5432/");
}

export async function withMaintenanceClient<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const pool = new pg.Pool({ connectionString: maintenanceDatabaseUrl(), max: 1 });
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 0");
    return await fn(client);
  } finally {
    client.release();
    await pool.end();
  }
}
