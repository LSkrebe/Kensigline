/**
 * Apply referral attribution tables to an existing database.
 *
 *   npx tsx src/scripts/migrate-referral.ts
 */
import "../load-env.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../core/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.resolve(__dirname, "../../db/referral.sql");

async function main() {
  const sql = readFileSync(sqlPath, "utf8");
  await pool.query(sql);
  console.log("[referral] migration ok");
  await pool.end();
}

main().catch((err) => {
  console.error("[referral] migration failed", err);
  process.exit(1);
});
