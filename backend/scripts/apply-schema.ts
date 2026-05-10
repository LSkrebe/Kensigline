/**
 * Apply backend/db/schema.sql using the same pg Pool + TLS rules as production (see core/db.ts).
 * Works without `psql`; uses DATABASE_URL from backend/.env.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/core/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "..", "db", "schema.sql");

async function main() {
  const sql = readFileSync(schemaPath, "utf8");
  console.log("Applying schema:", schemaPath);
  await pool.query(sql);
  console.log("Schema applied successfully.");
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
