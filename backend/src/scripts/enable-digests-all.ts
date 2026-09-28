/**
 * Enable filing brief digests for every billed member.
 *
 *   npx tsx src/scripts/enable-digests-all.ts
 */
import "../load-env.js";
import { enableDigestForAllMembers } from "../alerts/store.js";

async function main() {
  const result = await enableDigestForAllMembers();
  console.log("[digest] enable_all", result);
}

main().catch((err) => {
  console.error("[digest] enable_all_failed", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
