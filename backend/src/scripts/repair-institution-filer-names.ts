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
import { mapPoolLimit, prepareMaintenanceClient } from "./lib/maintenance-db.js";

export type RepairOpts = {
  dryRun?: boolean;
  fetchSec?: boolean;
  batchSize?: number;
  maxRounds?: number;
  /** Safe parallel accession repairs (default 2). */
  parallelism?: number;
};

type GenericGroup = {
  accession_no: string | null;
  url: string | null;
  txn_count: string;
};

const cikNameCache = new Map<string, string | null>();

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
  g: GenericGroup,
  fetchSec: boolean,
): Promise<string | null> {
  const cacheKey = String(g.accession_no ?? g.url ?? "").trim();
  if (cacheKey && cikNameCache.has(cacheKey)) {
    return cikNameCache.get(cacheKey) ?? null;
  }

  const indexJson = indexJsonFromFilingUrl(g.url, g.accession_no);
  if (!indexJson) {
    const fallback = g.accession_no ? `13F ${g.accession_no}` : null;
    if (cacheKey) cikNameCache.set(cacheKey, fallback);
    return fallback;
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
      if (!isPlaceholderInvestorName(name) && !isCikPlaceholderDisplayName(name)) {
        if (cacheKey) cikNameCache.set(cacheKey, name);
        return name;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[repair] sec_fetch_failed", g.accession_no, msg);
    }
  }

  const syncName = resolve13fFilerDisplayName(baseMeta, indexJson);
  if (!isPlaceholderInvestorName(syncName) && !isCikPlaceholderDisplayName(syncName)) {
    if (cacheKey) cikNameCache.set(cacheKey, syncName);
    return syncName;
  }

  const cik = String(baseMeta.cik ?? syncName.replace(/^CIK\s+/i, "")).replace(/\D/g, "");
  if (cik) {
    const cachedCik = cikNameCache.get(`cik:${cik}`);
    if (cachedCik !== undefined) {
      if (cacheKey) cikNameCache.set(cacheKey, cachedCik);
      return cachedCik;
    }
  }

  const asyncName = await resolve13fFilerDisplayNameAsync(baseMeta, indexJson);
  if (cik) {
    cikNameCache.set(`cik:${cik}`, asyncName);
  }
  if (cacheKey) cikNameCache.set(cacheKey, asyncName);
  return asyncName;
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

async function loadAllGenericGroups(client: pg.PoolClient): Promise<GenericGroup[]> {
  console.log("[repair] loading all placeholder accession groups (one-time scan)...");
  const started = Date.now();
  const r = await client.query<GenericGroup>(
    `
    SELECT
      fil.accession_no,
      min(fil.url) AS url,
      count(t.id)::text AS txn_count
    FROM institution_transactions t
    JOIN filers f ON f.id = t.filer_id
    JOIN filings fil ON fil.id = t.filing_id
    WHERE lower(trim(f.display_name)) IN ('institution', 'institutions')
      AND fil.accession_no IS NOT NULL
      AND trim(fil.accession_no) <> ''
    GROUP BY fil.accession_no
    ORDER BY count(t.id) DESC
    `,
  );
  console.log(
    `[repair] loaded groups=${r.rows.length} elapsed_sec=${((Date.now() - started) / 1000).toFixed(1)}`,
  );
  return r.rows;
}

type ResolvedAccessionGroup = {
  accession_no: string;
  filerName: string;
  txn_count: number;
};

async function resolveAccessionGroup(
  g: GenericGroup,
  fetchSec: boolean,
): Promise<ResolvedAccessionGroup | null> {
  const accession = String(g.accession_no ?? "").trim();
  if (!accession) return null;

  const filerName = await resolveFilerNameFromAccession(g, fetchSec);
  if (!filerName || isPlaceholderInvestorName(filerName) || isCikPlaceholderDisplayName(filerName)) {
    console.warn("[repair] skip_still_placeholder", g.accession_no, filerName);
    return null;
  }

  return {
    accession_no: accession,
    filerName,
    txn_count: Number(g.txn_count) || 0,
  };
}

/** One temp-table UPDATE per batch instead of per-accession round trips. */
async function bulkMigrateResolvedGroups(
  client: pg.PoolClient,
  resolved: ResolvedAccessionGroup[],
  dryRun: boolean,
): Promise<number> {
  if (!resolved.length) return 0;

  const nameToId = new Map<string, string>();
  for (const name of new Set(resolved.map((r) => r.filerName))) {
    const filer = await ensureFiler({ filerType: "institution", displayName: name });
    nameToId.set(name, filer.id);
  }

  const accessions: string[] = [];
  const filerIds: string[] = [];
  for (const row of resolved) {
    const filerId = nameToId.get(row.filerName);
    if (!filerId) continue;
    accessions.push(row.accession_no);
    filerIds.push(filerId);
  }
  if (!accessions.length) return 0;

  if (dryRun) {
    return resolved.reduce((sum, row) => sum + row.txn_count, 0);
  }

  await client.query(`DROP TABLE IF EXISTS _repair_acc_filer`);
  await client.query(`
    CREATE TEMP TABLE _repair_acc_filer (
      accession_no text PRIMARY KEY,
      filer_id uuid NOT NULL
    )
  `);

  await client.query(
    `
    INSERT INTO _repair_acc_filer (accession_no, filer_id)
    SELECT * FROM unnest($1::text[], $2::uuid[])
    ON CONFLICT (accession_no) DO UPDATE SET filer_id = EXCLUDED.filer_id
    `,
    [accessions, filerIds],
  );

  const r = await client.query(
    `
    UPDATE institution_transactions t
    SET filer_id = m.filer_id
    FROM filings fil, filers pf, _repair_acc_filer m
    WHERE fil.id = t.filing_id
      AND pf.id = t.filer_id
      AND fil.accession_no = m.accession_no
      AND lower(trim(pf.display_name)) IN ('institution', 'institutions')
    `,
  );
  return r.rowCount ?? 0;
}

export async function repairAllGenericInstitutionGroups(
  pool: pg.Pool,
  coordinator: pg.PoolClient,
  opts: RepairOpts,
): Promise<{ repairedGroups: number; updatedTxns: number; skipped: number; rounds: number }> {
  const dryRun = opts.dryRun === true;
  const fetchSec = opts.fetchSec === true;
  const batchSize = Math.max(1, opts.batchSize ?? 300);
  const maxRounds = opts.maxRounds ?? Number.POSITIVE_INFINITY;
  const parallelism = Math.min(6, Math.max(1, opts.parallelism ?? 4));

  let updatedTxns = 0;
  let repairedGroups = 0;
  let skipped = 0;
  let rounds = 0;

  console.log(`[repair] generic parallelism=${parallelism} batchSize=${batchSize}`);

  let pendingGroups: GenericGroup[] | null = null;
  let cursor = 0;

  for (;;) {
    if (rounds >= maxRounds) break;
    if (!pendingGroups) {
      pendingGroups = await loadAllGenericGroups(coordinator);
      cursor = 0;
    }
    if (cursor >= pendingGroups.length) break;

    const groups = pendingGroups.slice(cursor, cursor + batchSize);
    cursor += groups.length;
    rounds += 1;
    console.log(
      `[repair] generic batch round=${rounds} groups=${groups.length} progress=${cursor}/${pendingGroups.length}`,
    );

    const resolved = (
      await mapPoolLimit(groups, parallelism, (g) => resolveAccessionGroup(g, fetchSec))
    ).filter((row): row is ResolvedAccessionGroup => row != null);

    skipped += groups.length - resolved.length;
    if (resolved.length) {
      const sample = resolved.slice(0, 3).map((row) => ({
        accession: row.accession_no,
        filerName: row.filerName,
        txns: row.txn_count,
      }));
      console.log("[repair] generic batch_sample", sample);
      const batchUpdated = await bulkMigrateResolvedGroups(coordinator, resolved, dryRun);
      repairedGroups += resolved.length;
      updatedTxns += batchUpdated;
      console.log(
        `[repair] generic batch_updated groups=${resolved.length} txns=${batchUpdated} skipped=${groups.length - resolved.length}`,
      );
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
      const cacheKey = `cik:${cik}`;
      let raw = cikNameCache.has(cacheKey) ? cikNameCache.get(cacheKey) : null;
      if (raw === undefined || raw === null) {
        raw = await resolveInstitutionNameFromCik(cik);
        cikNameCache.set(cacheKey, raw);
      }
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
