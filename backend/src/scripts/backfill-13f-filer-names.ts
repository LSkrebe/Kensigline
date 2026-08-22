/**
 * Repair 13F rows ingested under the generic "Institution" filer.
 * Default: instant split by CIK/accession from filing URL (no SEC fetch).
 * Optional: --fetch-sec tries to resolve human-readable names from EDGAR (slow).
 *
 *   npx tsx src/scripts/backfill-13f-filer-names.ts
 *   npx tsx src/scripts/backfill-13f-filer-names.ts --fetch-sec --limit=20
 */
import "../load-env.js";
import { pool } from "../core/db.js";
import { fetchFilingPrimaryText } from "../core/sec.js";
import { parse13fMeta, resolve13fFilerDisplayName, type Parsed13fMeta } from "../investigate/institutions/parse-13f.js";
import { ensureFiler } from "../v2/canonical.js";
import { isPlaceholderInvestorName } from "../research/market/tracked-investors-filter.js";

const dryRun = process.argv.includes("--dry-run");
const fetchSec = process.argv.includes("--fetch-sec");
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 500);

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

function metaFromIndexUrl(indexJson: string, accessionNo: string | null): Parsed13fMeta {
  const cikM = indexJson.match(/\/data\/(\d+)\//);
  const accNoDashM = indexJson.match(/\/(\d{18})\//);
  let accession_no = String(accessionNo ?? "").trim() || null;
  if (!accession_no && accNoDashM) {
    const d = accNoDashM[1]!;
    accession_no = `${d.slice(0, 10)}-${d.slice(10, 12)}-${d.slice(12)}`;
  }
  const cik = cikM ? String(cikM[1]).replace(/\D/g, "").padStart(10, "0") : null;
  return { filer_name: null, cik, accession_no, filed_at: null, period_of_report: null };
}

async function resolveFilerName(g: {
  accession_no: string | null;
  url: string | null;
}): Promise<string | null> {
  const indexJson = indexJsonFromFilingUrl(g.url, g.accession_no);
  if (!indexJson) {
    return g.accession_no ? `13F ${g.accession_no}` : null;
  }

  const baseMeta = metaFromIndexUrl(indexJson, g.accession_no);

  if (fetchSec) {
    try {
      const { text } = await fetchFilingPrimaryText(indexJson);
      const meta = parse13fMeta(text, indexJson);
      const name = resolve13fFilerDisplayName(
        {
          filer_name: meta.filer_name ?? baseMeta.filer_name,
          cik: meta.cik ?? baseMeta.cik,
          accession_no: meta.accession_no ?? baseMeta.accession_no,
          filed_at: meta.filed_at,
          period_of_report: meta.period_of_report,
        },
        indexJson,
      );
      if (!isPlaceholderInvestorName(name)) return name;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("sec_fetch_failed", g.accession_no, msg);
    }
  }

  return resolve13fFilerDisplayName(baseMeta, indexJson);
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

  console.log("groups_to_repair", groups.rows.length, {
    dryRun,
    fetchSec,
  });

  let updatedTxns = 0;
  let repairedGroups = 0;

  for (const g of groups.rows) {
    const filerName = await resolveFilerName(g);
    if (!filerName || isPlaceholderInvestorName(filerName)) {
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
    const r = await pool.query(
      `
      UPDATE institution_transactions t
      SET filer_id = $1
      FROM filings fil
      WHERE fil.id = t.filing_id
        AND fil.id = ANY($2::uuid[])
      `,
      [filer.id, g.filing_ids],
    );
    updatedTxns += r.rowCount ?? 0;
    repairedGroups++;
  }

  console.log("done", { repairedGroups, updatedTxns, dryRun, fetchSec });
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
