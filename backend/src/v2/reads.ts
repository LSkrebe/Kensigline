/**
 * Schema v2 read helpers — FE-compatible payloads from typed tables (no documents.data).
 */
import { db } from "../core/db.js";
import { normalizeTicker } from "./canonical.js";

function moneyLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export async function loadFeedEntriesPage(opts: {
  feedKind: "research" | "insider" | "politicians" | "institutions";
  limit: number;
  offset: number;
}) {
  const limit = Math.max(1, Math.min(100, opts.limit));
  const offset = Math.max(0, opts.offset);
  const rows = await db.query<{
    id: string;
    feed_at: string;
    feed_label: string | null;
    ticker: string | null;
    company_name: string;
    issuer_id: string;
    filing_id: string | null;
    source_key: string | null;
    signal_score: number | null;
    signal_label: string | null;
    signal_reasons: string[] | null;
    today_count: number;
    paper_doc_count: number;
    url: string | null;
    pdf_url: string | null;
    index_url: string | null;
    accession_no: string | null;
    cik: string | null;
  }>(
    `
    SELECT
      e.id::text,
      e.feed_at::text,
      e.feed_label,
      i.ticker,
      i.name AS company_name,
      e.issuer_id::text,
      e.filing_id::text,
      e.source_key,
      e.signal_score,
      e.signal_label,
      e.signal_reasons,
      e.today_count,
      e.paper_doc_count,
      f.url,
      f.pdf_url,
      f.index_url,
      f.accession_no,
      i.cik
    FROM feed_entries e
    JOIN issuers i ON i.id = e.issuer_id
    LEFT JOIN filings f ON f.id = e.filing_id
    WHERE e.feed_kind = $1::feed_kind
    ORDER BY e.feed_at DESC NULLS LAST
    LIMIT $2 OFFSET $3
    `,
    [opts.feedKind, limit + 1, offset],
  );

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  if (opts.feedKind === "research") {
    return {
      items: page.map((r) => ({
        kind: "research_ticker",
        id: r.id,
        ticker: r.ticker,
        name: r.company_name,
        company_name: r.company_name,
        feed_label: r.feed_label,
        feed_at: r.feed_at,
        source_key: r.source_key,
        feed_kind: "research",
        intel_mode: "research",
        paper_doc_count: r.paper_doc_count,
        idea_score: r.signal_score,
        idea_best: Boolean(r.signal_label),
        idea_reasons: r.signal_reasons ?? [],
      })),
      has_more: hasMore,
      next_offset: hasMore ? offset + limit : null,
    };
  }

  // Investigate feeds: attach limited transaction preview (not a jsonb blob).
  const items = [];
  for (const r of page) {
    const preview = await loadTxnPreview(opts.feedKind, r.issuer_id, 24);
    items.push({
      id: r.filing_id ?? r.id,
      feed_at: r.feed_at,
      feed_label: r.feed_label,
      ticker: r.ticker,
      company_name: r.company_name,
      company_id: r.issuer_id,
      today_count: r.today_count,
      url: r.url,
      pdf_url: r.pdf_url,
      index_url: r.index_url,
      accession_no: r.accession_no,
      cik: r.cik,
      idea_score: r.signal_score,
      idea_best: Boolean(r.signal_label),
      idea_reasons: r.signal_reasons ?? [],
      worksheet_rows: preview.rows,
      insiders: opts.feedKind === "insider" ? preview.names : undefined,
      politicians: opts.feedKind === "politicians" ? preview.names : undefined,
      institutions: opts.feedKind === "institutions" ? preview.names : undefined,
      chamber: preview.chamber,
    });
  }

  return {
    items,
    has_more: hasMore,
    next_offset: hasMore ? offset + limit : null,
  };
}

async function loadTxnPreview(
  feedKind: "insider" | "politicians" | "institutions" | "research",
  issuerId: string,
  limit: number,
) {
  if (feedKind === "insider") {
    const rows = await db.query<any>(
      `
      SELECT
        f.display_name,
        t.role,
        t.transaction_code,
        t.acquired_disposed,
        t.amount_usd,
        t.shares,
        t.is_derivative,
        t.transaction_at::text AS ts
      FROM insider_transactions t
      JOIN filers f ON f.id = t.filer_id
      WHERE t.issuer_id = $1
      ORDER BY t.transaction_at DESC
      LIMIT $2
      `,
      [issuerId, limit],
    );
    return {
      names: [...new Set(rows.map((r) => r.display_name).filter(Boolean))],
      chamber: null as string | null,
      rows: rows.map((r) => ({
        key: r.role ? `${r.role} ${r.display_name}` : r.display_name,
        insider_name: r.display_name,
        role: r.role,
        transaction_code: r.transaction_code,
        acquired_disposed: r.acquired_disposed,
        amount_usd: r.amount_usd != null ? Number(r.amount_usd) : null,
        shares: r.shares != null ? Number(r.shares) : null,
        is_derivative: Boolean(r.is_derivative),
        ts: r.ts,
      })),
    };
  }
  if (feedKind === "politicians") {
    const rows = await db.query<any>(
      `
      SELECT
        f.display_name,
        t.chamber,
        t.committee,
        t.transaction_type,
        t.amount_usd,
        t.amount_usd_mid,
        t.amount_range,
        t.asset_name,
        t.description,
        t.transaction_at::text AS ts
      FROM politician_transactions t
      JOIN filers f ON f.id = t.filer_id
      WHERE t.issuer_id = $1
      ORDER BY t.transaction_at DESC
      LIMIT $2
      `,
      [issuerId, limit],
    );
    return {
      names: [...new Set(rows.map((r) => r.display_name).filter(Boolean))],
      chamber: rows[0]?.chamber ?? null,
      rows: rows.map((r) => ({
        key: r.display_name,
        chamber: r.chamber,
        committee: r.committee,
        transaction_type: r.transaction_type,
        amount_usd: r.amount_usd != null ? Number(r.amount_usd) : null,
        amount_usd_mid: r.amount_usd_mid != null ? Number(r.amount_usd_mid) : null,
        amount_range: r.amount_range,
        asset_name: r.asset_name,
        description: r.description,
        ts: r.ts,
      })),
    };
  }
  if (feedKind === "institutions") {
    const rows = await db.query<any>(
      `
      SELECT
        f.display_name,
        t.activity,
        t.amount_usd,
        t.shares,
        t.transaction_at::text AS ts
      FROM institution_transactions t
      JOIN filers f ON f.id = t.filer_id
      WHERE t.issuer_id = $1
      ORDER BY t.transaction_at DESC
      LIMIT $2
      `,
      [issuerId, limit],
    );
    return {
      names: [...new Set(rows.map((r) => r.display_name).filter(Boolean))],
      chamber: null as string | null,
      rows: rows.map((r) => ({
        key: r.display_name,
        institution_name: r.display_name,
        activity: r.activity,
        amount_usd: r.amount_usd != null ? Number(r.amount_usd) : null,
        shares: r.shares != null ? Number(r.shares) : null,
        ts: r.ts,
      })),
    };
  }
  return { names: [] as string[], chamber: null as string | null, rows: [] as any[] };
}

export async function buildIssuerExplorePayload(tickerInput: string) {
  const ticker = normalizeTicker(tickerInput);
  if (!ticker) return { ok: false, ticker: tickerInput, error: "invalid_ticker" };

  const issuer = await db.one<{ id: string; name: string; ticker: string }>(
    `SELECT id::text, name, ticker FROM issuers WHERE ticker = $1 LIMIT 1`,
    [ticker],
  );
  const companyName = issuer?.name ?? ticker;

  const docs = issuer
    ? await db.query<any>(
        `
        SELECT
          f.id::text,
          COALESCE(f.source_key, f.form, f.feed_kind::text) AS source,
          COALESCE(f.filed_at, f.event_at)::text AS "filedAt",
          f.url,
          f.analysis,
          f.signal_label AS idea_best,
          f.signal_score AS idea_score,
          f.signal_reasons AS idea_reasons
        FROM filings f
        WHERE f.issuer_id = $1
          AND f.show_on_ticker = true
          AND f.analysis IS NOT NULL
          AND length(trim(f.analysis)) > 0
        ORDER BY COALESCE(f.event_at, f.filed_at) DESC NULLS LAST
        LIMIT 40
        `,
        [issuer.id],
      )
    : [];

  const insiders = issuer
    ? await db.query<any>(
        `
        SELECT
          f.display_name AS person,
          f.display_name AS key,
          t.transaction_at::text AS date,
          t.amount_usd,
          t.transaction_code AS "transactionCode",
          fil.url
        FROM insider_transactions t
        JOIN filers f ON f.id = t.filer_id
        LEFT JOIN filings fil ON fil.id = t.filing_id
        WHERE t.issuer_id = $1
        ORDER BY t.transaction_at DESC
        LIMIT 40
        `,
        [issuer.id],
      )
    : [];

  const politicians = issuer
    ? await db.query<any>(
        `
        SELECT
          f.display_name AS name,
          t.chamber,
          t.committee,
          t.transaction_at::text AS date,
          t.amount_usd_mid AS amount_usd,
          t.transaction_type AS "transactionType",
          fil.url
        FROM politician_transactions t
        JOIN filers f ON f.id = t.filer_id
        LEFT JOIN filings fil ON fil.id = t.filing_id
        WHERE t.issuer_id = $1
        ORDER BY t.transaction_at DESC
        LIMIT 40
        `,
        [issuer.id],
      )
    : [];

  const filings13f = issuer
    ? await db.query<any>(
        `
        SELECT
          f.display_name AS filer,
          t.activity,
          t.transaction_at::text AS date,
          t.amount_usd,
          fil.url
        FROM institution_transactions t
        JOIN filers f ON f.id = t.filer_id
        LEFT JOIN filings fil ON fil.id = t.filing_id
        WHERE t.issuer_id = $1
        ORDER BY t.transaction_at DESC
        LIMIT 40
        `,
        [issuer.id],
      )
    : [];

  const tracked = [
    ...insiders.slice(0, 12).map((r, i) => ({
      id: `ins-${i}-${r.person}`,
      name: r.person,
      type: "insider",
      typeLabel: "Insider",
      amountUsd: r.amount_usd != null ? Number(r.amount_usd) : null,
      amount: moneyLabel(r.amount_usd),
      latestAt: r.date,
      transactionCode: r.transactionCode,
      code: r.transactionCode,
    })),
    ...politicians.slice(0, 8).map((r, i) => ({
      id: `pol-${i}-${r.name}`,
      name: r.name,
      type: "politician",
      typeLabel: "Politician",
      amountUsd: r.amount_usd != null ? Number(r.amount_usd) : null,
      amount: moneyLabel(r.amount_usd),
      latestAt: r.date,
      code: r.transactionType,
    })),
    ...filings13f.slice(0, 8).map((r, i) => ({
      id: `inst-${i}-${r.filer}`,
      name: r.filer,
      type: "institution",
      typeLabel: "Institution",
      amountUsd: r.amount_usd != null ? Number(r.amount_usd) : null,
      amount: moneyLabel(r.amount_usd),
      latestAt: r.date,
      activity: r.activity,
    })),
  ];

  return {
    ok: true,
    ticker,
    company_name: companyName,
    presentation: {
      title: companyName,
      subtitle: ticker,
      blocks: [],
      explainer: [],
      sources: [],
      documents: docs,
    },
    flows: {
      insiders: insiders.map((r) => ({
        key: r.key,
        person: r.person,
        date: r.date,
        amount: moneyLabel(r.amount_usd),
        transactionCode: r.transactionCode,
        url: r.url,
      })),
      politicians: politicians.map((r) => ({
        name: r.name,
        chamber: r.chamber,
        committee: r.committee,
        date: r.date,
        amount: moneyLabel(r.amount_usd),
        transactionType: r.transactionType,
        url: r.url,
      })),
      filings13f: filings13f.map((r) => ({
        filer: r.filer,
        activity: r.activity,
        date: r.date,
        amount: moneyLabel(r.amount_usd),
        url: r.url,
      })),
    },
    tracked_investors: tracked,
  };
}

export async function buildFilerDossierPayload(slug: string, mode: string) {
  const filer = await db.one<any>(
    `
    SELECT id::text, display_name, slug, detail, detail_secondary, filer_type::text
    FROM filers
    WHERE slug = $1
    LIMIT 1
    `,
    [slug],
  );
  if (!filer) {
    return { ok: true, slug, mode, empty: true, actor: null };
  }

  const source =
    mode === "politicians" || filer.filer_type === "politician"
      ? "politicians"
      : mode === "institutions" || filer.filer_type === "institution"
        ? "institutions"
        : "insider";

  let txns: any[] = [];
  if (source === "insider") {
    txns = await db.query<any>(
      `
      SELECT
        i.ticker,
        i.name AS company,
        t.transaction_at::text AS ts,
        t.role,
        t.transaction_code,
        t.acquired_disposed,
        t.amount_usd,
        t.shares,
        f.display_name
      FROM insider_transactions t
      JOIN issuers i ON i.id = t.issuer_id
      JOIN filers f ON f.id = t.filer_id
      WHERE t.filer_id = $1
      ORDER BY t.transaction_at DESC
      LIMIT 200
      `,
      [filer.id],
    );
  } else if (source === "politicians") {
    txns = await db.query<any>(
      `
      SELECT
        i.ticker,
        i.name AS company,
        t.transaction_at::text AS ts,
        t.chamber,
        t.committee,
        t.transaction_type,
        t.amount_usd,
        t.amount_usd_mid,
        t.amount_range,
        t.asset_name,
        f.display_name
      FROM politician_transactions t
      JOIN issuers i ON i.id = t.issuer_id
      JOIN filers f ON f.id = t.filer_id
      WHERE t.filer_id = $1
      ORDER BY t.transaction_at DESC
      LIMIT 200
      `,
      [filer.id],
    );
  } else {
    txns = await db.query<any>(
      `
      SELECT
        i.ticker,
        i.name AS company,
        t.transaction_at::text AS ts,
        t.activity,
        t.amount_usd,
        t.shares,
        f.display_name
      FROM institution_transactions t
      JOIN issuers i ON i.id = t.issuer_id
      JOIN filers f ON f.id = t.filer_id
      WHERE t.filer_id = $1
      ORDER BY t.transaction_at DESC
      LIMIT 200
      `,
      [filer.id],
    );
  }

  const transactions = txns.map((t) => {
    const amountUsd = t.amount_usd_mid != null ? Number(t.amount_usd_mid) : t.amount_usd != null ? Number(t.amount_usd) : null;
    const sheetRow =
      source === "insider"
        ? {
            person: t.display_name,
            insider_name: t.display_name,
            role: t.role,
            transactionCode: t.transaction_code,
            acquiredDisposed: t.acquired_disposed,
            amountUsd,
            shares: t.shares != null ? Number(t.shares) : null,
            ts: t.ts,
          }
        : source === "politicians"
          ? {
              politician_name: t.display_name,
              person: t.display_name,
              chamber: t.chamber,
              committee: t.committee,
              transactionType: t.transaction_type,
              amountUsd,
              amountRange: t.amount_range,
              assetName: t.asset_name,
              ts: t.ts,
            }
          : {
              institution_name: t.display_name,
              key: t.display_name,
              activity: t.activity,
              amountUsd,
              shares: t.shares != null ? Number(t.shares) : null,
              ts: t.ts,
            };
    return {
      sheetRow,
      ticker: t.ticker,
      company: t.company,
      companyRow: null,
      showMoney: amountUsd != null && amountUsd > 1,
      ts: t.ts,
      source,
    };
  });

  return {
    ok: true,
    slug,
    mode: source,
    actor: {
      id: filer.id,
      actorKey: filer.slug,
      actorName: filer.display_name,
      actorDetail: filer.detail,
      actorDetailSecondary: filer.detail_secondary,
      matchNames: [filer.display_name],
      source,
      sources: [source],
      at: transactions[0]?.ts ?? null,
      count: transactions.length,
      transactions,
    },
  };
}
