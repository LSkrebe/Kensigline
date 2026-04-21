import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({ connectionString: databaseUrl });

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

