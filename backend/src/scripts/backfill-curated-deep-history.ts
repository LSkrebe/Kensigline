/**
 * Curated full-history enqueue — one investor mode at a time (institutions → insiders → politicians).
 * Avoids SEC 503 stampedes from parallel type walks + parse.
 *
 *   node dist/scripts/backfill-curated-deep-history.js
 *   node dist/scripts/backfill-curated-deep-history.js --only institutions
 *   node dist/scripts/backfill-curated-deep-history.js --only insiders
 *   node dist/scripts/backfill-curated-deep-history.js --only politicians
 */
import "../load-env.js";
import { setTimeout as sleep } from "node:timers/promises";
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

type Mode = "institutions" | "insiders" | "politicians" | "all";

function parseArgs(argv: string[]) {
  let only: Mode = "all";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only" && argv[i + 1]) {
      const v = String(argv[++i]).trim().toLowerCase();
      if (v === "institutions" || v === "insiders" || v === "politicians" || v === "all") only = v;
    }
  }
  return {
    only,
    skipSec: argv.includes("--skip-sec"),
    skipHouse: argv.includes("--skip-house"),
    dryRun: argv.includes("--dry-run"),
    /** Pause between SEC CIK/ticker pulls to ease 503s (ms). */
    paceMs: Math.max(0, Number(process.env.CURATED_DEEP_PACE_MS ?? 750) || 750),
  };
}

function minFilingDate(): string {
  const raw = String(process.env.BACKFILL_MIN_DATE ?? "2012-01-01").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "2012-01-01";
}

async function enqueueHouseForCurated(paceMs: number): Promise<{ years: number; enqueued: number; discovered: number }> {
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
        // Last-name search already scopes the House table; still gate on curated names.
        // Also accept when the listing text contains the catalog last name (House formats vary).
        const matched = rows.filter((r) => {
          if (shouldIngestFiler(r.name)) return true;
          const n = String(r.name ?? "").toLowerCase();
          return Boolean(p.lastName) && n.includes(String(p.lastName).toLowerCase());
        });
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
      if (paceMs > 0) await sleep(paceMs);
    }
  }
  return { years, enqueued, discovered };
}

async function enqueueInstitutions(paceMs: number): Promise<{ institutions: number; enqueued: number; found: number }> {
  const minDate = minFilingDate();
  let enqueued = 0;
  let found = 0;
  let institutions = 0;
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
    if (paceMs > 0) await sleep(paceMs);
  }
  return { institutions, enqueued, found };
}

async function enqueueInsiders(paceMs: number): Promise<{ issuers: number; enqueued: number; found: number }> {
  const minDate = minFilingDate();
  let enqueued = 0;
  let found = 0;
  let issuers = 0;
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
        if (paceMs > 0) await sleep(Math.floor(paceMs / 2));
      }
      found += f;
      enqueued += e;
      console.log(
        `[curated-deep] insider ticker=${ticker} cik=${cik} name=${name} found=${f} enq=${e} pages=${pages}`,
      );
    } catch (e) {
      console.error(`[curated-deep] insider ticker=${ticker} failed`, e);
    }
    if (paceMs > 0) await sleep(paceMs);
  }
  return { issuers, enqueued, found };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const counts = curatedCatalogCounts();
  console.log(
    `[curated-deep] start catalog=${JSON.stringify(counts)} minDate=${minFilingDate()} ` +
      `only=${args.only} paceMs=${args.paceMs} dryRun=${args.dryRun}`,
  );
  if (args.dryRun) {
    console.log("[curated-deep] dry-run — tickers", curatedInsiderIssuerTickers());
    console.log("[curated-deep] dry-run — ciks", curatedInstitutionCiks());
    console.log("[curated-deep] dry-run — politicians", curatedPoliticianLastNames());
    process.exit(0);
  }

  const modes: Mode[] =
    args.only === "all" ? ["institutions", "insiders", "politicians"] : [args.only];

  for (const mode of modes) {
    console.log(`[curated-deep] phase=${mode} begin`);
    if (mode === "institutions" && !args.skipSec) {
      const sec = await enqueueInstitutions(args.paceMs);
      console.log(`[curated-deep] phase=institutions done found=${sec.found} enq=${sec.enqueued}`);
    } else if (mode === "insiders" && !args.skipSec) {
      const sec = await enqueueInsiders(args.paceMs);
      console.log(`[curated-deep] phase=insiders done found=${sec.found} enq=${sec.enqueued}`);
    } else if (mode === "politicians" && !args.skipHouse) {
      const house = await enqueueHouseForCurated(args.paceMs);
      console.log(
        `[curated-deep] phase=politicians done discovered=${house.discovered} enq=${house.enqueued} years=${house.years}`,
      );
    }
    console.log(`[curated-deep] phase=${mode} end`);
  }

  console.log("[curated-deep] done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[curated-deep] failed", err);
  process.exit(1);
});
