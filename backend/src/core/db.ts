import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

/** TLS for Supabase (and optional DATABASE_SSL=1). Local Postgres stays non-SSL unless forced. */
function sslOption(): boolean | { rejectUnauthorized: boolean } | undefined {
  if (process.env.DATABASE_SSL === "0" || process.env.DATABASE_SSL === "false") {
    return undefined;
  }
  if (process.env.DATABASE_SSL === "1" || process.env.DATABASE_SSL === "true") {
    return { rejectUnauthorized: true };
  }
  try {
    const normalized = databaseUrl.replace(/^postgres:/i, "postgresql:");
    const u = new URL(normalized);
    const host = u.hostname.toLowerCase();
    if (host.includes("supabase.co")) {
      return { rejectUnauthorized: true };
    }
  } catch {
    // ignore malformed URL
  }
  return undefined;
}

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: sslOption(),
});

export const db = {
  async query<T = any>(text: string, params: any[] = []): Promise<T[]> {
    const r = await pool.query(text, params);
    return r.rows as T[];
  },
  async one<T = any>(text: string, params: any[] = []): Promise<T | null> {
    const r = await pool.query(text, params);
    return (r.rows[0] as T | undefined) ?? null;
  },
};

