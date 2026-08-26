/**
 * Repair 13F institution filer names:
 * - Generic "Institution" bucket (split by accession / optional SEC fetch)
 * - CIK placeholders like "CIK 2149024" (resolve via SEC submissions)
 *
 *   npx tsx src/scripts/backfill-13f-filer-names.ts
 *   npx tsx src/scripts/backfill-13f-filer-names.ts --fetch-sec --limit=20
 *   npx tsx src/scripts/backfill-13f-filer-names.ts --cik-only
 */
import "../load-env.js";
import { pool } from "../core/db.js";
import { fetchFilingPrimaryText, isCikPlaceholderDisplayName, resolveInstitutionNameFromCik } from "../core/sec.js";
import {
  parse13fMeta,
  resolve13fFilerDisplayName,
  resolve13fFilerDisplayNameAsync,
  type Parsed13fMeta,
} from "../investigate/institutions/parse-13f.js";
import { formatCompanyDisplayName } from "../research/feed-display.js";
import { ensureFiler } from "../v2/canonical.js";
import { isPlaceholderInvestorName } from "../research/market/tracked-investors-filter.js";

const dryRun = process.argv.includes("--dry-run");
const fetchSec = process.argv.includes("--fetch-sec");
const cikOnly = process.argv.includes("--cik-only");
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

async function resolveFilerNameFromAccession(g: {
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
      if (!isPlaceholderInvestorName(name) && !isCikPlaceholderDisplayName(name)) return name;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("sec_fetch_failed", g.accession_no, msg);
    }
  }

  return resolve13fFilerDisplayNameAsync(baseMeta, indexJson);
}

async function migrateTransactionsToFiler(fromFilerId: string, toFilerId: string): Promise<number> {
  if (fromFilerId === toFilerId) return 0;
  const r = await pool.query(
    `
    UPDATE institution_transactions
    SET filer_id = $1
    WHERE filer_id = $2
    `,
    [toFilerId, fromFilerId],
  );
  return r.rowCount ?? 0;
}

async function renameCikFilerInPlace(filerId: string, oldName: string, newName: string) {
  await pool.query(`UPDATE filers SET display_name = $1, updated_at = now() WHERE id = $2`, [newName, filerId]);
  for (const raw of [newName, oldName]) {
    const key = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    await pool.query(
      `
      INSERT INTO filer_aliases (filer_id, filer_type, raw_name)
      VALUES ($1, 'institution'::filer_type, $2)
      ON CONFLICT (filer_type, raw_name) DO NOTHING
      `,
      [filerId, key],
    );
  }
}

async function repairGenericInstitutionGroups() {
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

  console.log("generic_institution_groups", groups.rows.length, { dryRun, fetchSec });

  let updatedTxns = 0;
  let repairedGroups = 0;

  for (const g of groups.rows) {
    const filerName = await resolveFilerNameFromAccession(g);
    if (!filerName || isPlaceholderInvestorName(filerName) || isCikPlaceholderDisplayName(filerName)) {
      console.warn("skip_still_placeholder", g.accession_no, filerName);
      continue;
    }

    console.log("repair_generic", {
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

  return { repairedGroups, updatedTxns };
}

async function repairCikNamedFilers() {
  const filers = await pool.query<{
    id: string;
    display_name: string;
    slug: string;
    txn_count: string;
  }>(
    `
    SELECT f.id, f.display_name, f.slug, count(t.id)::text AS txn_count
    FROM filers f
    LEFT JOIN institution_transactions t ON t.filer_id = f.id
    WHERE f.filer_type = 'institution'
      AND f.display_name ~ '^CIK [0-9]+$'
    GROUP BY f.id, f.display_name, f.slug
    ORDER BY count(t.id) DESC NULLS LAST
    LIMIT $1
    `,
    [limit],
  );

  console.log("cik_named_filers", filers.rows.length, { dryRun });

  let repaired = 0;

  for (const row of filers.rows) {
    const cik = row.display_name.replace(/^CIK\s+/i, "").trim();
    const raw = await resolveInstitutionNameFromCik(cik);
    if (!raw) {
      console.warn("skip_no_sec_name", row.display_name);
      continue;
    }
    const filerName = formatCompanyDisplayName(raw) || raw;
    if (isPlaceholderInvestorName(filerName)) {
      console.warn("skip_placeholder_after_format", row.display_name, filerName);
      continue;
    }

    console.log("repair_cik", {
      from: row.display_name,
      to: filerName,
      txns: row.txn_count,
      slug: row.slug,
    });

    if (dryRun) {
      repaired++;
      continue;
    }

    await renameCikFilerInPlace(row.id, row.display_name, filerName);
    repaired++;
  }

  return { repaired, migratedTxns: 0 };
}

async function main() {
  await pool.query(`SET statement_timeout = 0`);

  let generic = { repairedGroups: 0, updatedTxns: 0 };
  let cik = { repaired: 0, migratedTxns: 0 };

  if (!cikOnly) {
    generic = await repairGenericInstitutionGroups();
  }
  cik = await repairCikNamedFilers();

  console.log("done", { ...generic, cikRepaired: cik.repaired, cikMigratedTxns: cik.migratedTxns, dryRun, fetchSec, cikOnly });
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
