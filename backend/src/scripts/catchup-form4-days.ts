/**
 * One-shot Form 4 catch-up via SEC daily master.idx for recent UTC days.
 *
 *   node dist/scripts/catchup-form4-days.js
 *   node dist/scripts/catchup-form4-days.js --days 5 --limit 0
 */
import "../load-env.js";
import { enqueueFilingsFromDailyIndexDay } from "../core/sec.js";

function parseArgs(argv: string[]) {
  let days = 5;
  let limit = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--days" && argv[i + 1]) days = Math.max(1, Math.min(14, Number(argv[++i]) || 5));
    if (a === "--limit" && argv[i + 1]) limit = Math.max(0, Number(argv[++i]) || 0);
  }
  return { days, limit };
}

async function main() {
  const { days, limit } = parseArgs(process.argv.slice(2));
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);

  console.log(`[catchup-form4] days=${days} limit=${limit || "unlimited"}`);

  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today.getTime());
    day.setUTCDate(day.getUTCDate() - i);
    const r = await enqueueFilingsFromDailyIndexDay({
      dayUtc: day,
      form: "4",
      sourceType: "sec_form4",
      priority: 12,
      ...(limit > 0 ? { limit } : {}),
    });
    console.log(
      `[catchup-form4] day=${r.day} found=${r.found} enqueued=${r.enqueued} skipped=${r.skipped_existing}` +
        `${r.index_missing ? " index_missing" : ""}${r.truncated ? " truncated" : ""}`,
    );
  }

  console.log("[catchup-form4] done");
}

main().catch((err) => {
  console.error("[catchup-form4] failed", err);
  process.exit(1);
});
