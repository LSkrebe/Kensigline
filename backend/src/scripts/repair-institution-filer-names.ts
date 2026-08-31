import type pg from "pg";
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

export type RepairOpts = {
  dryRun?: boolean;
  fetchSec?: boolean;
  batchSize?: number;
  maxRounds?: number;
};

function indexJsonFromFilingUrl(url: string | null, accessionNo: string | null): string | null {
  const u = String(url ?? "").trim();
  let m = u.match(/\/Archives\/edgar\/data\/(\d+)\/(\d{18})\//i);
  if (m) return `https://www.sec.gov/Archives/edgar/data/${m[1]}/${m[2]}/index.json`;
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

async function resolveFilerNameFromAccession(
  g: { accession_no: string | null; url: string | null },
  fetchSec: boolean,
): Promise<string | null> {
  const indexJson = indexJsonFromFilingUrl(g.url, g.accession_no);
  if (!indexJson) return g.accession_no ? `13F ${g.accession_no}` : null;

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
      console.warn("[repair] sec_fetch_failed", g.accession_no, msg);
    }
  }

  return resolve13fFilerDisplayNameAsync(baseMeta, indexJson);
}

export async function countPlaceholderInstitutionTxns(client: pg.PoolClient): Promise<number> {
  const r = await client.query<{ n: string }>(
    `
    SELECT count(*)::text AS n
    FROM institution_transactions t
    JOIN filers f ON f.id = t.filer_id
    WHERE lower(trim(f.display_name)) IN ('institution', 'institutions')
    `,
  );
  return Number(r.rows[0]?.n ?? 0);
}

async function fetchGenericInstitutionBatch(client: pg.PoolClient, batchSize: number) {
  return client.query<{
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
    [batchSize],
  );
}

export async function repairAllGenericInstitutionGroups(
  client: pg.PoolClient,
  opts: RepairOpts,
): Promise<{ repairedGroups: number; updatedTxns: number; skipped: number; rounds: number }> {
  const dryRun = opts.dryRun === true;
  const fetchSec = opts.fetchSec === true;
  const batchSize = Math.max(1, opts.batchSize ?? 40);
  const maxRounds = opts.maxRounds ?? Number.POSITIVE_INFINITY;

  let updatedTxns = 0;
  let repairedGroups = 0;
  let skipped = 0;
  let rounds = 0;

  for (;;) {
    if (rounds >= maxRounds) break;
    const groups = await fetchGenericInstitutionBatch(client, batchSize);
    if (!groups.rows.length) break;
    rounds += 1;
    console.log(`[repair] generic batch round=${rounds} groups=${groups.rows.length}`);

    for (const g of groups.rows) {
      const filerName = await resolveFilerNameFromAccession(g, fetchSec);
      if (!filerName || isPlaceholderInvestorName(filerName) || isCikPlaceholderDisplayName(filerName)) {
        skipped += 1;
        console.warn("[repair] skip_still_placeholder", g.accession_no, filerName);
        continue;
      }

      console.log("[repair] generic", {
        accession: g.accession_no,
        filerName,
        filings: g.filing_ids.length,
        txns: g.txn_count,
      });

      if (dryRun) {
        repairedGroups += 1;
        continue;
      }

      const filer = await ensureFiler({ filerType: "institution", displayName: filerName });
      const r = await client.query(
        `
        UPDATE institution_transactions t
        SET filer_id = $1
        FROM filings fil
        WHERE fil.id = t.filing_id
          AND fil.id = ANY($2::uuid[])
          AND t.filer_id IN (
            SELECT id FROM filers WHERE lower(trim(display_name)) IN ('institution', 'institutions')
          )
        `,
        [filer.id, g.filing_ids],
      );
      updatedTxns += r.rowCount ?? 0;
      repairedGroups += 1;
    }

    if (dryRun) break;
  }

  return { repairedGroups, updatedTxns, skipped, rounds };
}

async function renameCikFilerInPlace(
  client: pg.PoolClient,
  filerId: string,
  oldName: string,
  newName: string,
) {
  await client.query(`UPDATE filers SET display_name = $1, updated_at = now() WHERE id = $2`, [
    newName,
    filerId,
  ]);
  for (const raw of [newName, oldName]) {
    const key = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    await client.query(
      `
      INSERT INTO filer_aliases (filer_id, filer_type, raw_name)
      VALUES ($1, 'institution'::filer_type, $2)
      ON CONFLICT (filer_type, raw_name) DO NOTHING
      `,
      [filerId, key],
    );
  }
}

export async function repairAllCikNamedFilers(
  client: pg.PoolClient,
  opts: RepairOpts,
): Promise<{ repaired: number; skipped: number; rounds: number }> {
  const dryRun = opts.dryRun === true;
  const batchSize = Math.max(1, opts.batchSize ?? 80);
  const maxRounds = opts.maxRounds ?? Number.POSITIVE_INFINITY;

  let repaired = 0;
  let skipped = 0;
  let rounds = 0;

  for (;;) {
    if (rounds >= maxRounds) break;
    const filers = await client.query<{
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
      [batchSize],
    );

    if (!filers.rows.length) break;
    rounds += 1;

    for (const row of filers.rows) {
      const cik = row.display_name.replace(/^CIK\s+/i, "").trim();
      const raw = await resolveInstitutionNameFromCik(cik);
      if (!raw) {
        skipped += 1;
        console.warn("[repair] skip_no_sec_name", row.display_name);
        continue;
      }
      const filerName = formatCompanyDisplayName(raw) || raw;
      if (isPlaceholderInvestorName(filerName)) {
        skipped += 1;
        console.warn("[repair] skip_placeholder_after_format", row.display_name, filerName);
        continue;
      }

      console.log("[repair] cik", { from: row.display_name, to: filerName, txns: row.txn_count });

      if (dryRun) {
        repaired += 1;
        continue;
      }

      await renameCikFilerInPlace(client, row.id, row.display_name, filerName);
      repaired += 1;
    }

    if (dryRun) break;
  }

  return { repaired, skipped, rounds };
}
