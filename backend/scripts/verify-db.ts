/**
 * Smoke test: connect with DATABASE_URL and list public tables.
 */
import "dotenv/config";
import { pool } from "../src/core/db.js";

async function main() {
  const info = await pool.query(`SELECT current_database() AS db, current_user AS role`);
  console.log("Connected:", info.rows[0]);

  const tabs = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  console.log("Public tables (" + tabs.rows.length + "):");
  for (const row of tabs.rows) {
    console.log(" -", row.tablename);
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
