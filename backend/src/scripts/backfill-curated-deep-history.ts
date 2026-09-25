/**
 * Curated full-history enqueue — every catalog investor, as far back as SEC / House / Senate / OGE go
 * within BACKFILL_MIN_DATE (default 2012 STOCK Act era). Not a 365d calendar flood.
 *
 *   npx tsx src/scripts/backfill-curated-deep-history.ts
 *   npx tsx src/scripts/backfill-curated-deep-history.ts --skip-house --skip-sec
 */
import "../load-env.js";
import { db } from "../core/db.js";
import { listHousePtrPdfsWithRetry } from "../core/house.js";
import { enqueueAllSecFilingsForCik, resolveCikForTicker } from "../core/sec.js";
import {
  curatedCatalogCounts,
  curatedInsiderIssuerTickers,
  curatedInstitutionCiks,
  curatedPoliticianLastNames,
} from "../explore/curated-deep-targets.js";
import { shouldIngestFiler } from "../explore/watchlist-catalog.js";
import { QUEUE_PRIORITY_BACKFILL_INDEX } from "../shared/ingest-policy.js";

function parseArgs(argv: string[]) {
  return {
    skipSec: argv.includes("--skip-sec"),
    skipHouse: argv.includes("--skip-house"),
    dryRun: argv.includes("--dry-run"),
  };
}

function minFilingDate(): string {
  const raw = String(process.env.BACKFILL_MIN_DATE ?? "2012-01-01").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "2012-01-01";
}

async function enqueueHouseForCurated(): Promise<{ years: number; enqueued: number; discovered: number }> {
  const minYear = Number(minFilingDate().slice(0, 4));
  const currentYear = new Date().getUTCFullYear();
  const people = curatedPoliticianLastNames();
  let enqueued = 0;
  let discovered = 0;
  let years = 0;

  for (let year = currentYear; year >= minYear; year--) {
    years += 1;
    for (const p of people) {
      try {
        const rows = await listHousePtrPdfsWithRetry({ filingYear: year, lastName: p.lastName, max: 2000 });
        const matched = rows.filter((r) => shouldIngestFiler(r.name));
        discovered += matched.length;
        for (const r of matched) {
          const ins = await db.one<{ id: string }>(
            `
            INSERT INTO document_queue (url, source_type, status, priority, updated_at)
            VALUES ($1, 'house_ptr', 'ready_to_parse', $2, now())
            ON CONFLICT (url, source_type) DO NOTHING
            RETURNING id
            `,
            [r.pdf_url, QUEUE_PRIORITY_BACKFILL_INDEX],
          );
          if (ins?.id) enqueued += 1;
        }
        console.log(
          `[curated-deep] house year=${year} last=${p.lastName} id=${p.id} rows=${rows.length} matched=${matched.length}`,
        );
      } catch (e) {
        console.error(`[curated-deep] house year=${year} last=${p.lastName} failed`, e);
      }
    }
  }
  return { years, enqueued, discovered };
}

async function enqueueSecForCurated(): Promise<{
  issuers: number;
  institutions: number;
  enqueued: number;
  found: number;
}> {
  const minDate = minFilingDate();
  let enqueued = 0;
  let found = 0;
  let issuers = 0;
  let institutions = 0;

  for (const ticker of curatedInsiderIssuerTickers()) {
    issuers += 1;
    try {
      const { cik } = await resolveCikForTicker(ticker);
      let name: string | null = null;
      let pages = 0;
      let f = 0;
      let e = 0;
      for (const [form, sourceType] of [
        ["3", "sec_form3"],
        ["4", "sec_form4"],
        ["5", "sec_form5"],
      ] as const) {
        const r = await enqueueAllSecFilingsForCik({
          cik,
          forms: [form],
          sourceType,
          priority: QUEUE_PRIORITY_BACKFILL_INDEX,
          minFilingDate: minDate,
        });
        name = r.name ?? name;
        pages = Math.max(pages, r.pages);
        f += r.found;
        e += r.enqueued;
      }
      found += f;
      enqueued += e;
      console.log(
        `[curated-deep] insider ticker=${ticker} cik=${cik} name=${name} found=${f} enq=${e} pages=${pages}`,
      );
    } catch (e) {
      console.error(`[curated-deep] insider ticker=${ticker} failed`, e);
    }
  }

  for (const row of curatedInstitutionCiks()) {
    institutions += 1;
    try {
      const r = await enqueueAllSecFilingsForCik({
        cik: row.cik,
        forms: ["13F-HR", "13F-HR/A"],
        sourceType: "sec_13f",
        priority: QUEUE_PRIORITY_BACKFILL_INDEX,
        minFilingDate: minDate,
      });
      found += r.found;
      enqueued += r.enqueued;
      console.log(
        `[curated-deep] institution id=${row.id} cik=${r.cik} name=${r.name} ` +
          `found=${r.found} enq=${r.enqueued} skip=${r.skipped_existing} pages=${r.pages}`,
      );
    } catch (e) {
      console.error(`[curated-deep] institution id=${row.id} cik=${row.cik} failed`, e);
    }
  }

  return { issuers, institutions, enqueued, found };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const counts = curatedCatalogCounts();
  console.log(
    `[curated-deep] start catalog=${JSON.stringify(counts)} minDate=${minFilingDate()} ` +
      `skipSec=${args.skipSec} skipHouse=${args.skipHouse} dryRun=${args.dryRun}`,
  );
  if (args.dryRun) {
    console.log("[curated-deep] dry-run — tickers", curatedInsiderIssuerTickers());
    console.log("[curated-deep] dry-run — ciks", curatedInstitutionCiks());
    console.log("[curated-deep] dry-run — politicians", curatedPoliticianLastNames());
    process.exit(0);
  }

  let house = { years: 0, enqueued: 0, discovered: 0 };
  let sec = { issuers: 0, institutions: 0, enqueued: 0, found: 0 };

  if (!args.skipSec) sec = await enqueueSecForCurated();
  if (!args.skipHouse) house = await enqueueHouseForCurated();

  console.log(
    `[curated-deep] done sec_found=${sec.found} sec_enq=${sec.enqueued} ` +
      `house_discovered=${house.discovered} house_enq=${house.enqueued} years=${house.years}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[curated-deep] failed", err);
  process.exit(1);
});
