/**
 * Repair 13F rows that were ingested under the generic "Institution" filer.
 * Re-fetches filing bundles from SEC, resolves real filer names, and re-links transactions.
 *
 *   npx tsx src/scripts/backfill-13f-filer-names.ts
 *   npx tsx src/scripts/backfill-13f-filer-names.ts --dry-run
 */
import "../load-env.js";
import { pool } from "../core/db.js";
import { fetch13fFilingBundle } from "../core/sec.js";
import { parse13fMeta, resolve13fFilerDisplayName } from "../investigate/institutions/parse-13f.js";
import { ensureFiler } from "../v2/canonical.js";
import { isPlaceholderInvestorName } from "../research/market/tracked-investors-filter.js";

const dryRun = process.argv.includes("--dry-run");
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 200);

function indexJsonFromFilingUrl(url: string | null, accessionNo: string | null): string | null {
  const u = String(url ?? "").trim();
  let m = u.match(/\/Archives\/edgar\/data\/(\d+)\/(\d{18})\//i);
  if (m) {
    return `https://www.sec.gov/Archives/edgar/data/${m[1]}/${m[2]}/index.json`;
  }
  if (u.endsWith("/index.json")) return u;
  const acc = String(accessionNo ?? "").trim();
  m = u.match(/\/Archives\/edgar\/data\/(\d+)\//i);
  if (m && acc) {
    const accNoDash = acc.replace(/-/g, "");
    return `https://www.sec.gov/Archives/edgar/data/${m[1]}/${accNoDash}/index.json`;
  }
  return null;
}

async function main() {
  const groups = await pool.query<{
    accession_no: string | null;
    url: string | null;
    filing_ids: string[];
    txn_count: string;
  }>(
    `
    SELECT
      fil.accession_no,
      min(fil.url) AS url,
      array_agg(DISTINCT fil.id::text) AS filing_ids,
      count(t.id)::text AS txn_count
    FROM institution_transactions t
    JOIN filers f ON f.id = t.filer_id
    JOIN filings fil ON fil.id = t.filing_id
    WHERE lower(trim(f.display_name)) IN ('institution', 'institutions')
    GROUP BY fil.accession_no
    ORDER BY count(t.id) DESC
    LIMIT $1
    `,
    [limit],
  );

  console.log("groups_to_repair", groups.rows.length, dryRun ? "(dry-run)" : "");

  let updatedTxns = 0;
  let repairedGroups = 0;

  for (const g of groups.rows) {
    const indexJson = indexJsonFromFilingUrl(g.url, g.accession_no);
    if (!indexJson) {
      console.warn("skip_no_index_url", g.accession_no, g.url);
      continue;
    }

    let filerName: string;
    try {
      const { bundle } = await fetch13fFilingBundle(indexJson);
      const meta = parse13fMeta(bundle, indexJson);
      filerName = resolve13fFilerDisplayName(meta, indexJson);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("skip_fetch_failed", g.accession_no, msg);
      if (g.accession_no) filerName = `13F ${g.accession_no}`;
      else continue;
    }

    if (isPlaceholderInvestorName(filerName)) {
      console.warn("skip_still_placeholder", g.accession_no, filerName);
      continue;
    }

    console.log("repair", {
      accession: g.accession_no,
      filerName,
      filings: g.filing_ids.length,
      txns: g.txn_count,
    });

    if (dryRun) {
      repairedGroups++;
      continue;
    }

    const filer = await ensureFiler({ filerType: "institution", displayName: filerName });
    const filingIds = g.filing_ids;
    const r = await pool.query(
      `
      UPDATE institution_transactions t
      SET filer_id = $1
      FROM filings fil
      WHERE fil.id = t.filing_id
        AND fil.id = ANY($2::uuid[])
      `,
      [filer.id, filingIds],
    );
    updatedTxns += r.rowCount ?? 0;
    repairedGroups++;
  }

  console.log("done", { repairedGroups, updatedTxns, dryRun });
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
