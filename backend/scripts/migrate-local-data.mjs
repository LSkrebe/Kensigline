/**
 * One-time: copy row data from local Postgres to DATABASE_URL (e.g. Supabase).
 * Schema must already exist on the target (run npm run db:apply-schema first).
 *
 * Set LOCAL_DATABASE_URL in backend/.env (do not commit). Example:
 *   LOCAL_DATABASE_URL=postgres://user@localhost:5432/postgres
 *
 * Requires `pg_dump` and `psql` on PATH.
 */
import "dotenv/config";
import { spawn } from "node:child_process";

const localUrl = process.env.LOCAL_DATABASE_URL;
const remoteUrl = process.env.DATABASE_URL;

if (!remoteUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!localUrl) {
  console.log("LOCAL_DATABASE_URL not set — skipping data migration (schema-only deploy).");
  console.log("To copy data from your old local DB, add LOCAL_DATABASE_URL to backend/.env and run again.");
  process.exit(0);
}

console.log("Migrating data from LOCAL_DATABASE_URL → DATABASE_URL …");

const dump = spawn("pg_dump", [localUrl, "--data-only", "--no-owner", "--no-acl"]);

const restore = spawn("psql", [remoteUrl, "-v", "ON_ERROR_STOP=1"], {
  stdio: ["pipe", "inherit", "inherit"],
});

dump.stdout.pipe(restore.stdin);

dump.stderr.pipe(process.stderr);

dump.on("exit", (code, sig) => {
  if (sig) {
    restore.kill();
    process.exit(1);
  }
  if (code !== 0) {
    restore.kill();
    process.exit(code ?? 1);
  }
  restore.stdin.end();
});

restore.on("exit", (code) => {
  process.exit(code === null ? 1 : code);
});

dump.on("error", (err) => {
  console.error(err.message);
  console.error("Install PostgreSQL client tools (pg_dump, psql) or migrate manually.");
  process.exit(1);
});

restore.on("error", (err) => {
  console.error(err.message);
  process.exit(1);
});
