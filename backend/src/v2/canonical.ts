/**
 * Schema v2 canonical writers — issuers / filers / filings / transactions / feed_entries.
 * No documents.data blobs.
 */
import { db } from "../core/db.js";
import {
  assertSingleInstitutionTxnPerFiling,
  consolidateInstitutionTxnRows,
  type InstitutionTxnRow,
} from "../investigate/institutions/institution-txn-guards.js";

export type { InstitutionTxnRow };

export function normalizeTicker(raw: string | null | undefined): string | null {
  const t = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "");
  return t || null;
}

export function slugifyFilerName(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "unknown";
}

export async function ensureIssuer(opts: {
  ticker?: string | null;
  name?: string | null;
  cik?: string | null;
}): Promise<{ id: string; ticker: string | null; name: string }> {
  const ticker = normalizeTicker(opts.ticker);
  const name = String(opts.name ?? ticker ?? "Unknown").trim() || "Unknown";
  const cik = opts.cik ? String(opts.cik).trim() : null;

  if (ticker) {
    const row = await db.one<{ id: string; ticker: string; name: string }>(
      `
      INSERT INTO issuers (ticker, name, cik, updated_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (ticker) DO UPDATE SET
        name = COALESCE(NULLIF(EXCLUDED.name, ''), issuers.name),
        cik = COALESCE(EXCLUDED.cik, issuers.cik),
        updated_at = now()
      RETURNING id, ticker, name
      `,
      [ticker, name, cik],
    );
    if (row) {
      // Keep legacy companies row in sync for cutover reads.
      await db.query(
        `
        INSERT INTO companies (id, name, ticker, updated_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (name) DO UPDATE SET
          ticker = COALESCE(EXCLUDED.ticker, companies.ticker),
          updated_at = now()
        `,
        [row.id, row.name, row.ticker],
      ).catch(async () => {
        await db.query(
          `
          INSERT INTO companies (name, ticker, updated_at)
          VALUES ($1, $2, now())
          ON CONFLICT (name) DO UPDATE SET ticker = COALESCE(EXCLUDED.ticker, companies.ticker), updated_at = now()
          `,
          [row.name, row.ticker],
        );
      });
      return row;
    }
  }

  const byName = await db.one<{ id: string; ticker: string | null; name: string }>(
    `
    INSERT INTO issuers (ticker, name, cik, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (ticker) DO UPDATE SET updated_at = now()
    RETURNING id, ticker, name
    `,
    [ticker ?? `UNK-${crypto.randomUUID().slice(0, 8)}`, name, cik],
  );
  if (!byName) throw new Error("ensure_issuer_failed");
  return byName;
}

export async function ensureFiler(opts: {
  filerType: "insider" | "politician" | "institution";
  displayName: string;
  detail?: string | null;
  detailSecondary?: string | null;
}): Promise<{ id: string; slug: string; display_name: string }> {
  const displayName = String(opts.displayName ?? "").trim() || "Unknown";
  const rawKey = displayName.toLowerCase();
  const existing = await db.one<{ id: string; slug: string; display_name: string }>(
    `
    SELECT f.id, f.slug, f.display_name
    FROM filer_aliases a
    JOIN filers f ON f.id = a.filer_id
    WHERE a.filer_type = $1::filer_type AND a.raw_name = $2
    LIMIT 1
    `,
    [opts.filerType, rawKey],
  );
  if (existing) return existing;

  let slug = slugifyFilerName(displayName);
  const clash = await db.one<{ id: string }>(`SELECT id FROM filers WHERE slug = $1`, [slug]);
  if (clash) slug = `${slug}-${opts.filerType}-${crypto.randomUUID().slice(0, 6)}`;

  try {
    const filer = await db.one<{ id: string; slug: string; display_name: string }>(
      `
      INSERT INTO filers (filer_type, display_name, slug, detail, detail_secondary, updated_at)
      VALUES ($1::filer_type, $2, $3, $4, $5, now())
      RETURNING id, slug, display_name
      `,
      [opts.filerType, displayName, slug, opts.detail ?? null, opts.detailSecondary ?? null],
    );
    if (!filer) throw new Error("ensure_filer_failed");

    await db.query(
      `
      INSERT INTO filer_aliases (filer_id, filer_type, raw_name)
      VALUES ($1, $2::filer_type, $3)
      ON CONFLICT (filer_type, raw_name) DO NOTHING
      `,
      [filer.id, opts.filerType, rawKey],
    );
    return filer;
  } catch (err: any) {
    // Concurrent insert races on slug or alias — resolve via alias/slug lookup.
    if (String(err?.code) === "23505") {
      const viaAlias = await db.one<{ id: string; slug: string; display_name: string }>(
        `
        SELECT f.id, f.slug, f.display_name
        FROM filer_aliases a
        JOIN filers f ON f.id = a.filer_id
        WHERE a.filer_type = $1::filer_type AND a.raw_name = $2
        LIMIT 1
        `,
        [opts.filerType, rawKey],
      );
      if (viaAlias) return viaAlias;
      const viaSlug = await db.one<{ id: string; slug: string; display_name: string }>(
        `SELECT id, slug, display_name FROM filers WHERE slug = $1 LIMIT 1`,
        [slug],
      );
      if (viaSlug) {
        await db.query(
          `
          INSERT INTO filer_aliases (filer_id, filer_type, raw_name)
          VALUES ($1, $2::filer_type, $3)
          ON CONFLICT (filer_type, raw_name) DO NOTHING
          `,
          [viaSlug.id, opts.filerType, rawKey],
        );
        return viaSlug;
      }
      // Last resort: unique slug retry.
      slug = `${slugifyFilerName(displayName)}-${crypto.randomUUID().slice(0, 8)}`;
      const filer = await db.one<{ id: string; slug: string; display_name: string }>(
        `
        INSERT INTO filers (filer_type, display_name, slug, detail, detail_secondary, updated_at)
        VALUES ($1::filer_type, $2, $3, $4, $5, now())
        RETURNING id, slug, display_name
        `,
        [opts.filerType, displayName, slug, opts.detail ?? null, opts.detailSecondary ?? null],
      );
      if (!filer) throw new Error("ensure_filer_failed");
      await db.query(
        `
        INSERT INTO filer_aliases (filer_id, filer_type, raw_name)
        VALUES ($1, $2::filer_type, $3)
        ON CONFLICT (filer_type, raw_name) DO NOTHING
        `,
        [filer.id, opts.filerType, rawKey],
      );
      return filer;
    }
    throw err;
  }
}

export type FilingInsert = {
  queueId?: string | null;
  sourceType: string;
  feedKind: "research" | "insider" | "politicians" | "institutions" | null;
  form?: string | null;
  issuerId?: string | null;
  url?: string | null;
  pdfUrl?: string | null;
  indexUrl?: string | null;
  accessionNo?: string | null;
  title?: string | null;
  sourceKey?: string | null;
  analysis?: string | null;
  filedAt?: string | null;
  eventAt?: string | null;
  contentSha256?: string | null;
  signalScore?: number | null;
  signalLabel?: string | null;
  signalReasons?: string[] | null;
  programKeys?: string[] | null;
  showOnTicker?: boolean;
};

export async function insertFiling(f: FilingInsert): Promise<string> {
  if (f.contentSha256) {
    const dup = await db.one<{ id: string }>(
      `SELECT id FROM filings WHERE content_sha256 = $1 LIMIT 1`,
      [f.contentSha256],
    );
    if (dup?.id) return dup.id;
  }

  try {
    const row = await db.one<{ id: string }>(
      `
      INSERT INTO filings (
        queue_id, source_type, feed_kind, form, issuer_id,
        url, pdf_url, index_url, accession_no, title, source_key, analysis,
        filed_at, event_at, content_sha256,
        signal_score, signal_label, signal_reasons, program_keys, show_on_ticker
      )
      VALUES (
        $1, $2, $3::feed_kind, $4, $5,
        $6, $7, $8, $9, $10, $11, $12,
        $13::timestamptz, $14::timestamptz, $15,
        $16, $17, $18, $19, $20
      )
      RETURNING id
      `,
      [
        f.queueId ?? null,
        f.sourceType,
        f.feedKind,
        f.form ?? null,
        f.issuerId ?? null,
        f.url ?? null,
        f.pdfUrl ?? null,
        f.indexUrl ?? null,
        f.accessionNo ?? null,
        f.title ?? null,
        f.sourceKey ?? null,
        f.analysis ?? null,
        f.filedAt ?? null,
        f.eventAt ?? null,
        f.contentSha256 ?? null,
        f.signalScore ?? null,
        f.signalLabel ?? null,
        f.signalReasons ?? [],
        f.programKeys ?? [],
        f.showOnTicker !== false,
      ],
    );
    if (!row?.id) throw new Error("insert_filing_failed");
    return row.id;
  } catch (err: any) {
    if (f.contentSha256 && String(err?.code) === "23505") {
      const again = await db.one<{ id: string }>(
        `SELECT id FROM filings WHERE content_sha256 = $1 LIMIT 1`,
        [f.contentSha256],
      );
      if (again?.id) return again.id;
    }
    throw err;
  }
}

export async function upsertFeedEntry(opts: {
  feedKind: "research" | "insider" | "politicians" | "institutions";
  issuerId: string;
  filingId: string;
  feedAt: string;
  feedLabel?: string | null;
  sourceKey?: string | null;
  signalScore?: number | null;
  signalLabel?: string | null;
  signalReasons?: string[] | null;
  todayCount?: number;
  paperDocCount?: number;
}) {
  await db.query(
    `
    INSERT INTO feed_entries (
      feed_kind, issuer_id, filing_id, feed_at, feed_label, source_key,
      signal_score, signal_label, signal_reasons, today_count, paper_doc_count, updated_at
    )
    VALUES (
      $1::feed_kind, $2, $3, $4::timestamptz, $5, $6,
      $7, $8, $9, $10, $11, now()
    )
    ON CONFLICT (feed_kind, issuer_id) DO UPDATE SET
      filing_id = EXCLUDED.filing_id,
      feed_at = CASE
        WHEN EXCLUDED.feed_at >= feed_entries.feed_at THEN EXCLUDED.feed_at
        ELSE feed_entries.feed_at
      END,
      feed_label = COALESCE(EXCLUDED.feed_label, feed_entries.feed_label),
      source_key = COALESCE(EXCLUDED.source_key, feed_entries.source_key),
      signal_score = COALESCE(EXCLUDED.signal_score, feed_entries.signal_score),
      signal_label = COALESCE(EXCLUDED.signal_label, feed_entries.signal_label),
      signal_reasons = CASE
        WHEN cardinality(EXCLUDED.signal_reasons) > 0 THEN EXCLUDED.signal_reasons
        ELSE feed_entries.signal_reasons
      END,
      today_count = GREATEST(EXCLUDED.today_count, feed_entries.today_count),
      paper_doc_count = GREATEST(EXCLUDED.paper_doc_count, feed_entries.paper_doc_count),
      updated_at = now()
    `,
    [
      opts.feedKind,
      opts.issuerId,
      opts.filingId,
      opts.feedAt,
      opts.feedLabel ?? null,
      opts.sourceKey ?? null,
      opts.signalScore ?? null,
      opts.signalLabel ?? null,
      opts.signalReasons ?? [],
      opts.todayCount ?? 0,
      opts.paperDocCount ?? 0,
    ],
  );
}

export type InsiderTxnRow = {
  filerId: string;
  role?: string | null;
  transactionCode?: string | null;
  acquiredDisposed?: string | null;
  amountUsd?: number | null;
  shares?: number | null;
  isDerivative?: boolean;
  transactionAt: string;
};

export async function replaceInsiderTransactions(
  filingId: string,
  issuerId: string,
  rows: InsiderTxnRow[],
) {
  await db.query(`DELETE FROM insider_transactions WHERE filing_id = $1`, [filingId]);
  if (!rows.length) return;
  const filerIds = rows.map((r) => r.filerId);
  const roles = rows.map((r) => r.role ?? null);
  const codes = rows.map((r) => r.transactionCode ?? null);
  const ads = rows.map((r) => r.acquiredDisposed ?? null);
  const amounts = rows.map((r) => (Number.isFinite(r.amountUsd as number) ? r.amountUsd : null));
  const shares = rows.map((r) => (Number.isFinite(r.shares as number) ? r.shares : null));
  const deriv = rows.map((r) => Boolean(r.isDerivative));
  const ats = rows.map((r) => r.transactionAt);
  await db.query(
    `
    INSERT INTO insider_transactions (
      filing_id, issuer_id, filer_id, role, transaction_code, acquired_disposed,
      amount_usd, shares, is_derivative, transaction_at
    )
    SELECT $1, $2, filer_id, role, code, ad, amount_usd, shares, is_derivative, at::timestamptz
    FROM unnest(
      $3::uuid[], $4::text[], $5::text[], $6::text[], $7::float8[], $8::float8[], $9::boolean[], $10::text[]
    ) AS t(filer_id, role, code, ad, amount_usd, shares, is_derivative, at)
    `,
    [filingId, issuerId, filerIds, roles, codes, ads, amounts, shares, deriv, ats],
  );
}

export type PoliticianTxnRow = {
  filerId: string;
  chamber?: string | null;
  committee?: string | null;
  transactionType?: string | null;
  amountUsd?: number | null;
  amountUsdMid?: number | null;
  amountRange?: string | null;
  assetName?: string | null;
  description?: string | null;
  transactionAt: string;
};

export async function replacePoliticianTransactions(
  filingId: string,
  issuerId: string,
  rows: PoliticianTxnRow[],
) {
  await db.query(`DELETE FROM politician_transactions WHERE filing_id = $1`, [filingId]);
  if (!rows.length) return;
  for (const chunk of chunkRows(rows, 100)) {
    const filerIds = chunk.map((r) => r.filerId);
    const chambers = chunk.map((r) => r.chamber ?? null);
    const committees = chunk.map((r) => r.committee ?? null);
    const types = chunk.map((r) => r.transactionType ?? null);
    const amounts = chunk.map((r) => (Number.isFinite(r.amountUsd as number) ? r.amountUsd : null));
    const mids = chunk.map((r) => (Number.isFinite(r.amountUsdMid as number) ? r.amountUsdMid : null));
    const ranges = chunk.map((r) => r.amountRange ?? null);
    const assets = chunk.map((r) => r.assetName ?? null);
    const descs = chunk.map((r) => r.description ?? null);
    const ats = chunk.map((r) => r.transactionAt);
    await db.query(
      `
      INSERT INTO politician_transactions (
        filing_id, issuer_id, filer_id, chamber, committee, transaction_type,
        amount_usd, amount_usd_mid, amount_range, asset_name, description, transaction_at
      )
      SELECT $1, $2, filer_id, chamber, committee, txn_type,
             amount_usd, amount_usd_mid, amount_range, asset_name, description, at::timestamptz
      FROM unnest(
        $3::uuid[], $4::text[], $5::text[], $6::text[],
        $7::float8[], $8::float8[], $9::text[], $10::text[], $11::text[], $12::text[]
      ) AS t(filer_id, chamber, committee, txn_type, amount_usd, amount_usd_mid, amount_range, asset_name, description, at)
      `,
      [filingId, issuerId, filerIds, chambers, committees, types, amounts, mids, ranges, assets, descs, ats],
    );
  }
}

export async function replaceInstitutionTransactions(
  filingId: string,
  issuerId: string,
  rows: InstitutionTxnRow[],
) {
  await db.query(`DELETE FROM institution_transactions WHERE filing_id = $1`, [filingId]);
  if (!rows.length) return;

  const normalized = consolidateInstitutionTxnRows(rows);

  const filerIds = normalized.map((r) => r.filerId);
  const activities = normalized.map((r) => r.activity ?? null);
  const amounts = normalized.map((r) => (Number.isFinite(r.amountUsd as number) ? r.amountUsd : null));
  const shares = normalized.map((r) => (Number.isFinite(r.shares as number) ? r.shares : null));
  const ats = normalized.map((r) => r.transactionAt);
  await db.query(
    `
    INSERT INTO institution_transactions (
      filing_id, issuer_id, filer_id, activity, amount_usd, shares, transaction_at
    )
    SELECT $1, $2, filer_id, activity, amount_usd, shares, at::timestamptz
    FROM unnest($3::uuid[], $4::text[], $5::float8[], $6::float8[], $7::text[])
      AS t(filer_id, activity, amount_usd, shares, at)
    `,
    [filingId, issuerId, filerIds, activities, amounts, shares, ats],
  );
  await assertSingleInstitutionTxnPerFiling(filingId);
}

export async function insertResearchEvent(opts: {
  filingId: string;
  issuerId?: string | null;
  sourceKey?: string | null;
  analysis?: string | null;
  eventAt?: string | null;
  programKeys?: string[] | null;
  showOnTicker?: boolean;
  forwardRevenueGrowthPct?: number | null;
  signalScore?: number | null;
  signalLabel?: string | null;
  signalReasons?: string[] | null;
}) {
  await db.query(
    `
    INSERT INTO research_events (
      filing_id, issuer_id, source_key, analysis, event_at, program_keys, show_on_ticker,
      forward_revenue_growth_pct, signal_score, signal_label, signal_reasons
    )
    VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7, $8, $9, $10, $11)
    `,
    [
      opts.filingId,
      opts.issuerId ?? null,
      opts.sourceKey ?? null,
      opts.analysis ?? null,
      opts.eventAt ?? null,
      opts.programKeys ?? [],
      opts.showOnTicker !== false,
      opts.forwardRevenueGrowthPct ?? null,
      opts.signalScore ?? null,
      opts.signalLabel ?? null,
      opts.signalReasons ?? [],
    ],
  );
}

export async function replaceResearchDrivers(
  filingId: string,
  issuerId: string | null,
  drivers: Array<{
    label: string;
    driverKind?: string | null;
    rollsUpToRevenue?: boolean | null;
    valueUsdMillions?: number | null;
    unit?: string | null;
    period?: string | null;
  }>,
) {
  await db.query(`DELETE FROM research_drivers WHERE filing_id = $1`, [filingId]);
  if (!drivers.length) return;
  for (const d of drivers) {
    await db.query(
      `
      INSERT INTO research_drivers (
        filing_id, issuer_id, label, driver_kind, rolls_up_to_revenue, value_usd_millions, unit, period
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        filingId,
        issuerId,
        d.label,
        d.driverKind ?? null,
        d.rollsUpToRevenue ?? null,
        d.valueUsdMillions ?? null,
        d.unit ?? null,
        d.period ?? null,
      ],
    );
  }
}

function chunkRows<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
