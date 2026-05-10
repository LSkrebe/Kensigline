/**
 * Apply backend/db/schema.sql to DATABASE_URL (local or Supabase).
 * Requires `psql` on PATH (brew install libpq / Postgres.app).
 *
 * If `psql` cannot resolve the Supabase host (IPv4-only network), use the
 * Session pooler URI from the dashboard or paste `db/schema.sql` into the
 * Supabase SQL Editor and run it there.
 *
 * Usage: npm run db:apply-schema  (from backend/)
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const schemaPath = join(backendRoot, "db", "schema.sql");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required (set in backend/.env)");
  process.exit(1);
}

const r = spawnSync(
  "psql",
  [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", schemaPath],
  { cwd: backendRoot, stdio: "inherit", env: process.env },
);

if (r.error) {
  console.error(r.error.message);
  console.error("Install PostgreSQL client tools so `psql` is available, or run schema.sql in the Supabase SQL editor.");
  process.exit(1);
}

process.exit(r.status === null ? 1 : r.status);
