/**
 * Shrink Postgres to the curated Explore catalog (50) while keeping FULL
 * transaction + price history for those investors from day one.
 *
 * Drops: non-catalog filers' txs, orphan filings, HTML page cache, queue junk,
 * unused price rows, repair backups, disposable snapshots.
 * Dedupes bars when disclosure_price_history already covers a ticker.
 *
 *   npx tsx src/scripts/purge-to-curated-universe.ts --dry-run
 *   npx tsx src/scripts/purge-to-curated-universe.ts --execute
 *   npx tsx src/scripts/purge-to-curated-universe.ts --execute --vacuum
 */
import "../load-env.js";
import { pool, db } from "../core/db.js";
import {
  EXPLORE_WATCHLIST_CATALOG,
  normalizeTrackedName,
  type ExploreWatchlistCatalogEntry,
} from "../explore/watchlist-catalog.js";

const FILER_BATCH = Math.max(20, Number(process.env.PURGE_FILER_BATCH ?? 100) || 100);
const ROW_BATCH = Math.max(1_000, Number(process.env.PURGE_ROW_BATCH ?? 8_000) || 8_000);
const TIMEOUT_MS = Math.max(60_000, Number(process.env.PURGE_STATEMENT_TIMEOUT_MS ?? 600_000) || 600_000);

const PLACEHOLDER_NAMES = new Set([
  "institution",
  "institutions",
  "insider",
  "insiders",
  "politician",
  "politicians",
  "unknown",
  "filer",
  "n/a",
  "ade",
  "s co",
]);

/** Strict keep match — do not use loose isTrackedUniverseName (substring false positives). */
function catalogEntryForFiler(slug: string, displayName: string): ExploreWatchlistCatalogEntry | null {
  const s = slug.trim().toLowerCase();
  const bare = s.replace(/-institution-[a-f0-9]+$/i, "").replace(/-politician-[a-f0-9]+$/i, "");
  const nameKey = normalizeTrackedName(displayName);
  if (!nameKey || PLACEHOLDER_NAMES.has(nameKey)) return null;

  for (const entry of EXPLORE_WATCHLIST_CATALOG) {
    const slugs = entry.slugs.map((x) => x.toLowerCase());
    if (entry.id === s || entry.id === bare || slugs.includes(s) || slugs.includes(bare)) return entry;
    // Accept `citadel-advisors-llc` when catalog has `citadel-advisors`
    if (slugs.some((a) => s === a || s.startsWith(`${a}-`) || bare.startsWith(`${a}-`))) return entry;
  }

  for (const entry of EXPLORE_WATCHLIST_CATALOG) {
    const keys = [
      normalizeTrackedName(entry.name),
      ...entry.matchNames.map(normalizeTrackedName),
      ...entry.slugs.map((x) => normalizeTrackedName(x.replace(/-/g, " "))),
    ].filter((k) => k.length >= 4);

    for (const tracked of keys) {
      if (nameKey === tracked) return entry;
      // Multi-token: require every token len>=3 present (handles "CITADEL ADVISORS LLC")
      const parts = tracked.split(" ").filter((p) => p.length >= 3);
      if (parts.length >= 2 && parts.every((p) => nameKey.includes(p))) return entry;
      // Single strong token identity (e.g. "pelosi", "tuberville") — min length 6
      if (parts.length === 1 && parts[0]!.length >= 6 && nameKey.includes(parts[0]!)) return entry;
    }
  }
  return null;
}

function args() {
  const a = process.argv.slice(2);
  return {
    dryRun: a.includes("--dry-run") || (!a.includes("--execute") && !a.includes("--finish")),
    vacuum: a.includes("--vacuum"),
    /** Skip txn/orphan deletes — resume after a mid-prune failure. */
    finishOnly: a.includes("--finish"),
  };
}

async function q<T extends Record<string, unknown>>(sql: string, params: unknown[] = [], ms = TIMEOUT_MS) {
  return db.queryApi<T>(sql, params, ms);
}

/** Direct client — for VACUUM FULL (cannot run inside a transaction). */
async function withRawClient<T>(fn: (client: { query: (typeof pool)["query"] }) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 0");
    return await fn(client);
  } finally {
    client.release();
  }
}

async function sizeReport(label: string) {
  const rows = await q<{ relname: string; total: string }>(
    `
    SELECT c.relname,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 12
    `,
  );
  const dbSize = await q<{ db: string }>(`SELECT pg_size_pretty(pg_database_size(current_database())) AS db`);
  console.log(`[purge] ${label} db=${dbSize[0]?.db}`);
  for (const r of rows) console.log(`  ${String(r.relname).padEnd(34)} ${r.total}`);
}

async function resolveKeepFilerIds(): Promise<string[]> {
  const filers = await q<{ id: string; slug: string; display_name: string; filer_type: string }>(
    `SELECT id::text AS id, slug, display_name, filer_type::text FROM filers`,
  );

  const keep = new Set<string>();
  const matchedCatalog = new Set<string>();
  const keepFilers: typeof filers = [];

  for (const f of filers) {
    const entry = catalogEntryForFiler(f.slug, f.display_name);
    if (!entry) continue;
    const modeOk =
      (entry.mode === "politicians" && f.filer_type === "politician") ||
      (entry.mode === "insiders" && f.filer_type === "insider") ||
      (entry.mode === "institutions" && f.filer_type === "institution");
    if (!modeOk) continue;
    keep.add(f.id);
    matchedCatalog.add(entry.id);
    keepFilers.push(f);
  }

  const byType: Record<string, number> = {};
  for (const f of keepFilers) byType[f.filer_type] = (byType[f.filer_type] ?? 0) + 1;

  const missing = EXPLORE_WATCHLIST_CATALOG.map((e) => e.id).filter((id) => !matchedCatalog.has(id));

  console.log(
    `[purge] catalog=${EXPLORE_WATCHLIST_CATALOG.length} keep_filers=${keep.size} matched_catalog=${matchedCatalog.size} ` +
      `by_type=${JSON.stringify(byType)} total_filers=${filers.length}`,
  );
  if (missing.length) console.warn(`[purge] catalog gaps (no filer): ${missing.join(", ")}`);
  else console.log(`[purge] every catalog entry has ≥1 filer match`);
  console.log(
    `[purge] keep sample:`,
    keepFilers
      .slice(0, 20)
      .map((f) => `${f.filer_type}:${f.display_name}`)
      .join(" | "),
  );

  return [...keep];
}

async function countOutside(keepIds: string[]) {
  const [inst, insider, pol, filings] = await Promise.all([
    q<{ n: string; keep_n: string }>(
      `SELECT count(*)::text AS n,
              count(*) FILTER (WHERE filer_id = ANY($1::uuid[]))::text AS keep_n
       FROM institution_transactions`,
      [keepIds],
    ),
    q<{ n: string; keep_n: string }>(
      `SELECT count(*)::text AS n,
              count(*) FILTER (WHERE filer_id = ANY($1::uuid[]))::text AS keep_n
       FROM insider_transactions`,
      [keepIds],
    ),
    q<{ n: string; keep_n: string }>(
      `SELECT count(*)::text AS n,
              count(*) FILTER (WHERE filer_id = ANY($1::uuid[]))::text AS keep_n
       FROM politician_transactions`,
      [keepIds],
    ),
    q<{ n: string }>(`SELECT count(*)::text AS n FROM filings`),
  ]);
  console.log(
    `[purge] txs institution=${inst[0]?.n} (keep ${inst[0]?.keep_n}) ` +
      `insider=${insider[0]?.n} (keep ${insider[0]?.keep_n}) ` +
      `politician=${pol[0]?.n} (keep ${pol[0]?.keep_n}) filings=${filings[0]?.n}`,
  );
  return {
    dropInst: Number(inst[0]?.n ?? 0) - Number(inst[0]?.keep_n ?? 0),
    keepInst: Number(inst[0]?.keep_n ?? 0),
    dropInsider: Number(insider[0]?.n ?? 0) - Number(insider[0]?.keep_n ?? 0),
    keepInsider: Number(insider[0]?.keep_n ?? 0),
    dropPol: Number(pol[0]?.n ?? 0) - Number(pol[0]?.keep_n ?? 0),
    keepPol: Number(pol[0]?.keep_n ?? 0),
  };
}

async function deleteRowsBatched(table: string, whereSql: string, params: unknown[]) {
  let total = 0;
  for (;;) {
    const rows = await q<{ n: string }>(
      `
      WITH doomed AS (
        SELECT id FROM ${table}
        WHERE ${whereSql}
        LIMIT ${ROW_BATCH}
      ),
      d AS (
        DELETE FROM ${table} t USING doomed d WHERE t.id = d.id RETURNING 1
      )
      SELECT count(*)::text AS n FROM d
      `,
      params,
    );
    const n = Number(rows[0]?.n ?? 0);
    total += n;
    if (n === 0) break;
    if (total === n || total % (ROW_BATCH * 5) < ROW_BATCH) {
      console.log(`[purge] ${table}: deleted=${total}`);
    }
  }
  console.log(`[purge] ${table}: done deleted=${total}`);
  return total;
}

async function deleteTxsNotInKeep(table: string, keepIds: string[]) {
  const outsiders = await q<{ id: string }>(
    `
    SELECT DISTINCT t.filer_id::text AS id
    FROM ${table} t
    WHERE NOT (t.filer_id = ANY($1::uuid[]))
    `,
    [keepIds],
  );
  console.log(`[purge] ${table}: ${outsiders.length} non-keep filers`);
  let deleted = 0;
  for (let i = 0; i < outsiders.length; i += FILER_BATCH) {
    const chunk = outsiders.slice(i, i + FILER_BATCH).map((r) => r.id);
    // One filer can own many rows — delete in row batches until chunk is clear.
    for (;;) {
      const rows = await q<{ n: string }>(
        `
        WITH doomed AS (
          SELECT id FROM ${table}
          WHERE filer_id = ANY($1::uuid[])
          LIMIT ${ROW_BATCH}
        ),
        d AS (
          DELETE FROM ${table} t USING doomed d WHERE t.id = d.id RETURNING 1
        )
        SELECT count(*)::text AS n FROM d
        `,
        [chunk],
      );
      const n = Number(rows[0]?.n ?? 0);
      deleted += n;
      if (n === 0) break;
    }
    if (i === 0 || (i / FILER_BATCH) % 5 === 0 || i + FILER_BATCH >= outsiders.length) {
      console.log(
        `[purge] ${table}: deleted=${deleted} filers=${Math.min(i + FILER_BATCH, outsiders.length)}/${outsiders.length}`,
      );
    }
  }
  return deleted;
}

async function deleteOrphanFilings() {
  let total = 0;
  for (;;) {
    const rows = await q<{ n: string }>(
      `
      WITH doomed AS (
        SELECT f.id
        FROM filings f
        WHERE NOT EXISTS (SELECT 1 FROM institution_transactions t WHERE t.filing_id = f.id)
          AND NOT EXISTS (SELECT 1 FROM insider_transactions t WHERE t.filing_id = f.id)
          AND NOT EXISTS (SELECT 1 FROM politician_transactions t WHERE t.filing_id = f.id)
        LIMIT ${ROW_BATCH}
      ),
      d AS (
        DELETE FROM filings f USING doomed d WHERE f.id = d.id RETURNING 1
      )
      SELECT count(*)::text AS n FROM d
      `,
    );
    const n = Number(rows[0]?.n ?? 0);
    total += n;
    console.log(`[purge] orphan filings batch=${n} total=${total}`);
    if (n === 0) break;
  }
  return total;
}

async function pruneCachesAndPrices(keepIds: string[]) {
  await q(`TRUNCATE investor_image_company_sources`);
  console.log(`[purge] truncated investor_image_company_sources`);

  // Queue is ephemeral ingest state — curated deep-backfill can re-enqueue.
  // Cannot TRUNCATE document_queue while filings.queue_id FK exists (even if all NULL).
  await q(`UPDATE filings SET queue_id = NULL WHERE queue_id IS NOT NULL`);
  await deleteRowsBatched("document_queue", `true`, []);
  console.log(`[purge] cleared document_queue`);

  for (const table of [
    "explore_home_snapshot",
    "investor_dossier_cache",
    "company_dossier_cache",
    "feed_cluster_snapshot",
    "ticker_context_cache",
    "institution_repair_backups",
  ]) {
    try {
      await q(`TRUNCATE ${table}`);
      console.log(`[purge] truncated ${table}`);
    } catch (e) {
      console.warn(`[purge] skip ${table}:`, (e as Error).message?.slice(0, 140));
    }
  }

  try {
    await q(`TRUNCATE research_drivers, research_events CASCADE`);
    console.log(`[purge] truncated research_*`);
  } catch (e) {
    console.warn(`[purge] research:`, (e as Error).message?.slice(0, 140));
  }

  const tickers = await q<{ ticker: string }>(
    `
    SELECT DISTINCT upper(i.ticker) AS ticker
    FROM issuers i
    WHERE i.ticker IS NOT NULL AND (
      EXISTS (SELECT 1 FROM institution_transactions t WHERE t.issuer_id = i.id AND t.filer_id = ANY($1::uuid[]))
      OR EXISTS (SELECT 1 FROM insider_transactions t WHERE t.issuer_id = i.id AND t.filer_id = ANY($1::uuid[]))
      OR EXISTS (SELECT 1 FROM politician_transactions t WHERE t.issuer_id = i.id AND t.filer_id = ANY($1::uuid[]))
    )
    UNION SELECT 'SPY'
    `,
    [keepIds],
  );
  const list = tickers.map((t) => String(t.ticker)).filter(Boolean);
  console.log(`[purge] keep price tickers=${list.length}`);

  // PK is ticker — delete unused tickers directly (row count is small vs txs).
  {
    const rows = await q<{ n: string }>(
      `
      WITH d AS (
        DELETE FROM disclosure_price_history
        WHERE NOT (upper(ticker) = ANY($1::text[]))
        RETURNING 1
      )
      SELECT count(*)::text AS n FROM d
      `,
      [list],
    );
    console.log(`[purge] disclosure_price_history deleted=${rows[0]?.n ?? 0}`);
  }
  // bars may use (ticker, day) PK — delete via ctid
  for (;;) {
    const rows = await q<{ n: string }>(
      `
      WITH doomed AS (
        SELECT ctid FROM bars
        WHERE NOT (upper(ticker) = ANY($1::text[]))
        LIMIT ${ROW_BATCH}
      ),
      d AS (
        DELETE FROM bars b USING doomed d WHERE b.ctid = d.ctid RETURNING 1
      )
      SELECT count(*)::text AS n FROM d
      `,
      [list],
    );
    const n = Number(rows[0]?.n ?? 0);
    console.log(`[purge] bars unused deleted batch=${n}`);
    if (n === 0) break;
  }

  try {
    await q(`DELETE FROM bars_ticker_meta WHERE NOT (upper(ticker) = ANY($1::text[]))`, [list]);
  } catch {
    /* optional */
  }

  // One price store: drop bars when disclosure already has a usable series.
  for (;;) {
    const rows = await q<{ n: string }>(
      `
      WITH doomed AS (
        SELECT b.ctid
        FROM bars b
        WHERE EXISTS (
          SELECT 1 FROM disclosure_price_history p
          WHERE upper(p.ticker) = upper(b.ticker)
            AND p.bars IS NOT NULL
            AND jsonb_array_length(p.bars) > 30
        )
        LIMIT ${ROW_BATCH}
      ),
      d AS (
        DELETE FROM bars b USING doomed d WHERE b.ctid = d.ctid RETURNING 1
      )
      SELECT count(*)::text AS n FROM d
      `,
    );
    const n = Number(rows[0]?.n ?? 0);
    console.log(`[purge] bars dedupe batch=${n}`);
    if (n === 0) break;
  }
}

async function deleteNonKeepFilers(keepIds: string[]) {
  await q(`DELETE FROM investor_images WHERE NOT (filer_id = ANY($1::uuid[]))`, [keepIds]);
  try {
    await q(`DELETE FROM tracker_watchlist WHERE NOT (filer_id = ANY($1::uuid[]))`, [keepIds]);
  } catch {
    /* ok */
  }

  const outsiders = await q<{ id: string }>(
    `SELECT id::text AS id FROM filers WHERE NOT (id = ANY($1::uuid[]))`,
    [keepIds],
  );
  let deleted = 0;
  for (let i = 0; i < outsiders.length; i += FILER_BATCH) {
    const chunk = outsiders.slice(i, i + FILER_BATCH).map((r) => r.id);
    const rows = await q<{ n: string }>(
      `
      WITH d AS (DELETE FROM filers WHERE id = ANY($1::uuid[]) RETURNING 1)
      SELECT count(*)::text AS n FROM d
      `,
      [chunk],
    );
    deleted += Number(rows[0]?.n ?? 0);
    if (i === 0 || (i / FILER_BATCH) % 10 === 0 || i + FILER_BATCH >= outsiders.length) {
      console.log(`[purge] filers deleted=${deleted}/${outsiders.length}`);
    }
  }
  return deleted;
}

async function vacuumMajor() {
  console.log(`[purge] VACUUM FULL (reclaims disk for Supabase quota)…`);
  const tables = [
    "filings",
    "institution_transactions",
    "insider_transactions",
    "politician_transactions",
    "document_queue",
    "disclosure_price_history",
    "bars",
    "filers",
    "filer_aliases",
    "feed_entries",
    "investor_image_company_sources",
  ];
  await withRawClient(async (client) => {
    for (const t of tables) {
      const t0 = Date.now();
      try {
        await client.query(`VACUUM FULL ANALYZE ${t}`);
        console.log(`[purge] VACUUM FULL ${t} ok ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      } catch (e) {
        console.warn(`[purge] VACUUM FULL ${t} failed:`, (e as Error).message?.slice(0, 160));
      }
    }
  });
}

async function verify(keepIds: string[]) {
  const stats = await countOutside(keepIds);
  const samples = await q<{ name: string; n: string }>(
    `
    SELECT f.display_name AS name, count(*)::text AS n
    FROM institution_transactions t
    JOIN filers f ON f.id = t.filer_id
    GROUP BY f.display_name
    ORDER BY count(*) DESC
    LIMIT 20
    `,
  );
  console.log(`[purge] verify top institution filers:`);
  for (const s of samples) console.log(`  ${String(s.n).padStart(8)}  ${s.name}`);

  const trump = await q<{ n: string }>(
    `
    SELECT count(*)::text AS n
    FROM politician_transactions t
    JOIN filers f ON f.id = t.filer_id
    WHERE lower(f.slug) LIKE '%trump%' OR lower(f.display_name) LIKE '%trump%'
    `,
  );
  const berk = await q<{ n: string }>(
    `
    SELECT count(*)::text AS n
    FROM institution_transactions t
    JOIN filers f ON f.id = t.filer_id
    WHERE lower(f.display_name) LIKE '%berkshire%' OR lower(f.slug) LIKE '%berkshire%'
    `,
  );
  const pelosi = await q<{ n: string }>(
    `
    SELECT count(*)::text AS n
    FROM politician_transactions t
    JOIN filers f ON f.id = t.filer_id
    WHERE lower(f.slug) LIKE '%pelosi%' OR lower(f.display_name) LIKE '%pelosi%'
    `,
  );
  console.log(
    `[purge] verify trump_txs=${trump[0]?.n} pelosi_txs=${pelosi[0]?.n} berkshire_txs=${berk[0]?.n}`,
  );
  console.log(`[purge] verify keep inst/insider/pol = ${stats.keepInst}/${stats.keepInsider}/${stats.keepPol}`);
  if (stats.dropInst > 0 || stats.dropInsider > 0 || stats.dropPol > 0) {
    console.warn(`[purge] WARNING still have non-keep txs remaining`);
  }
  await sizeReport("after");
}

async function main() {
  const { dryRun, vacuum, finishOnly } = args();
  console.log(
    `[purge] start dryRun=${dryRun} vacuum=${vacuum} finishOnly=${finishOnly} catalog=${EXPLORE_WATCHLIST_CATALOG.length}`,
  );
  await sizeReport("before");

  const keepIds = await resolveKeepFilerIds();
  if (keepIds.length < 30) {
    throw new Error(`keep set too small (${keepIds.length}) — aborting for safety`);
  }

  const counts = await countOutside(keepIds);
  console.log(`[purge] would drop inst_txs≈${counts.dropInst} insider≈${counts.dropInsider} pol≈${counts.dropPol}`);

  if (dryRun) {
    console.log(`[purge] dry-run only — pass --execute or --finish to apply`);
    return;
  }

  if (!finishOnly) {
    console.log(`[purge] EXECUTING destructive purge…`);
    await deleteTxsNotInKeep("institution_transactions", keepIds);
    await deleteTxsNotInKeep("insider_transactions", keepIds);
    await deleteTxsNotInKeep("politician_transactions", keepIds);
    await deleteOrphanFilings();
  } else {
    console.log(`[purge] FINISH ONLY — caches, prices, filers, vacuum`);
  }

  await pruneCachesAndPrices(keepIds);
  await deleteOrphanFilings();
  await deleteNonKeepFilers(keepIds);

  if (vacuum) await vacuumMajor();
  await verify(keepIds);
  console.log(`[purge] done`);
}

main()
  .catch((err) => {
    console.error("[purge] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
  });
