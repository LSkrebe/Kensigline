/**
 * Daily attribution report — systematic funnel counts by referral source.
 * Emails yesterday (UTC) + all-time to ATTRIBUTION_REPORT_TO.
 *
 * Usage:
 *   node dist/scripts/send-attribution-daily.js
 *   node dist/scripts/send-attribution-daily.js --to lukas.skrebe@gmail.com
 *   npm run attribution:report -- --to lukas.skrebe@gmail.com
 */
import "../load-env.js";
import {
  attributionReportRecipient,
  runAttributionDailyReport,
} from "../attribution/daily-report.js";

function readArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return String(process.argv[idx + 1] ?? "").trim() || null;
}

async function main() {
  const to = readArg("--to") ?? attributionReportRecipient();
  const force = process.argv.includes("--force");

  console.log("[attribution-report] start", {
    to,
    force,
    at: new Date().toISOString(),
  });

  const result = await runAttributionDailyReport({ to, force });
  console.log("[attribution-report] done", result);
  // already_sent is success for cron idempotency; only hard-fail real errors.
  if (!result.ok && result.reason !== "already_sent" && result.reason !== "disabled") {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[attribution-report] fatal", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
