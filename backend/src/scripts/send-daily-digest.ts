/**
 * Activity brief sender — run hourly from cron.
 * Sends only when there are real disclosures (not quiet/fallback days).
 * At most one email per user per local calendar day.
 *
 * Usage:
 *   node dist/scripts/send-daily-digest.js
 *   node dist/scripts/send-daily-digest.js --test lukas.skrebe@gmail.com
 *   node dist/scripts/send-daily-digest.js --force
 */
import "../load-env.js";
import { digestTestRecipient } from "../alerts/config.js";
import { runDailyDigest } from "../alerts/digest-run.js";

function readArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return String(process.argv[idx + 1] ?? "").trim() || null;
}

async function main() {
  const testFlag = process.argv.includes("--test");
  const testEmail = readArg("--test") ?? (testFlag ? digestTestRecipient() : null);
  const force = process.argv.includes("--force");

  console.log("[digest] start", {
    test: Boolean(testEmail),
    force,
    at: new Date().toISOString(),
  });

  const result = await runDailyDigest({
    ...(testEmail ? { testEmail } : {}),
    force,
  });

  console.log("[digest] done", result);
  if (!result.ok && result.reason) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[digest] fatal", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
