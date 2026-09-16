import type http from "node:http";
import { URL } from "node:url";
import { db } from "../core/db.js";
import { enqueueLatestForm4ForTicker } from "../core/sec.js";
import { json, notFound, route, sendJson } from "../core/http.js";
import { formatUsdCompact } from "../shared/money.js";
import { isPlaceholderInvestorName } from "../research/market/tracked-investors-filter.js";
import { resolveResearchFeedCompanyName } from "../research/feed-display.js";
import { getSecTickerTitleMap } from "../core/sec.js";
import {
  clampInt,
  countWorksheetEventsToday,
  isCompanyClusterId,
  latestEventAtFromDoc,
  parseEventTimeMs,
  tickerFromClusterId,
  tickerFromCompanyClusterId,
} from "../shared/feed-helpers.js";
import { loadTickerFeedDocs, parseFeedPageParams } from "../shared/ticker-feed-aggregate.js";
import {
  feedCacheKey,
  readFeedResponseCache,
  writeFeedResponseCache,
} from "../shared/feed-response-cache.js";
import { normalizeInsiderWorksheetRow } from "./worksheet.js";
import { isoTimestampFromDb } from "../shared/db-time.js";
import { enrichPoliticianWorksheetRows } from "../politicians/committees.js";
import {
  scoreInsiderCluster,
  scoreInstitutionCluster,
  scorePoliticianCluster,
} from "../core/idea-score.js";
import { readClusterSnapshot, writeClusterSnapshot } from "./cluster-snapshot.js";

async function serveClusterSnapshotOrNull(
  res: http.ServerResponse,
  args: { feedKind: string; ticker: string; days: number },
): Promise<boolean> {
  const hit = await readClusterSnapshot(args).catch(() => null);
  if (!hit) return false;
  sendJson(res, 200, hit);
  return true;
}

function cacheClusterSnapshot(args: {
  feedKind: string;
  ticker: string;
  days: number;
  payload: Record<string, unknown>;
}) {
  void writeClusterSnapshot(args).catch(() => {});
}

function ideaFromSummary(summary: Record<string, unknown> | null | undefined) {
  const s = summary ?? {};
  return {
    idea_score: Number(s.idea_score) || 0,
    idea_best: Boolean(s.idea_best),
    idea_reasons: Array.isArray(s.idea_reasons) ? (s.idea_reasons as string[]) : [],
  };
}

/** Returns true if a route handled the request. */
export async function tryInvestigateRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<boolean> {
  if (route(req, url, "POST", "/api/insider/form4/enqueue")) {
    const body = await json(req);
    const ticker = String(body?.ticker ?? "").trim();
    const limit = body?.limit != null ? Number(body.limit) : 25;
    if (!ticker) {
      sendJson(res, 400, { ok: false, error: "ticker_required" });
      return true;
    }
    const out = await enqueueLatestForm4ForTicker({ ticker, limit });
    sendJson(res, 200, { ok: true, ...out });
    return true;
  }

  if (route(req, url, "POST", "/api/insider/parse-next")) {
    sendJson(res, 410, {
      ok: false,
      error: "parse_next_disabled",
      message: "Background worker is enabled; parsing runs automatically.",
    });
    return true;
  }

  if (route(req, url, "GET", "/api/insider/feed")) {
    await handleInsiderFeed(res, url);
    return true;
  }

  if (route(req, url, "GET", "/api/politicians/feed")) {
    await handleTickerAggregatedFeed(res, url, "politicians");
    return true;
  }

  if (route(req, url, "GET", "/api/institutions/feed")) {
    await handleTickerAggregatedFeed(res, url, "institutions");
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/politicians/cluster/")) {
    await handlePoliticiansCluster(res, url);
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/institutions/cluster/")) {
    await handleInstitutionsCluster(res, url);
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/insider/cluster/")) {
    await handleInsiderCluster(res, url);
    return true;
  }

  return false;
}

async function handleInsiderFeed(res: http.ServerResponse, url: URL) {
  const mode = String(url.searchParams.get("mode") ?? "company").trim().toLowerCase();
  const page = parseFeedPageParams(url, { limit: 40, maxLimit: 120 });
  const days = clampInt(url.searchParams.get("days"), 1, 90, 30);

  if (mode !== "company") {
    const rows = await db.query<{
      id: string;
      event_at: string | null;
      feed_label: string | null;
      ticker: string | null;
      company_id: string | null;
    }>(
      `SELECT f.id::text, f.event_at::text AS event_at, COALESCE(f.title, f.source_key) AS feed_label,
              i.ticker, f.issuer_id::text AS company_id
       FROM filings f
       LEFT JOIN issuers i ON i.id = f.issuer_id
       WHERE f.feed_kind = 'insider' AND f.event_at IS NOT NULL
       ORDER BY f.event_at DESC, f.parsed_at DESC
       LIMIT $1 OFFSET $2`,
      [page.limit, page.offset],
    );
    sendJson(res, 200, {
      items: rows.map((r) => ({
        id: r.id,
        feed_at: r.event_at,
        feed_label: r.feed_label,
        ticker: r.ticker,
        company_id: r.company_id,
      })),
      offset: page.offset,
      limit: page.limit,
      has_more: rows.length >= page.limit,
      next_offset: page.offset + rows.length,
    });
    return;
  }

  const cacheKey = feedCacheKey({
    route: "insider_feed",
    mode: "company",
    days,
    limit: page.limit,
    offset: page.offset,
    cursor: page.cursor ? `${page.cursor.feedAt}|${page.cursor.ticker}` : "",
  });
  const cached = readFeedResponseCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    sendJson(res, 200, cached);
    return;
  }

  const { loadFeedEntriesPage } = await import("../v2/reads.js");
  const pageData = await loadFeedEntriesPage({
    feedKind: "insider",
    limit: page.limit,
    offset: page.offset,
  });
  const body = {
    items: pageData.items,
    days,
    mode: "company",
    offset: page.offset,
    limit: page.limit,
    has_more: pageData.has_more,
    next_offset: pageData.next_offset ?? page.offset + pageData.items.length,
    next_cursor: null as string | null,
  };
  writeFeedResponseCache(cacheKey, body);
  sendJson(res, 200, body);
}

type TickerFeedKind = "politicians" | "institutions";

async function handleTickerAggregatedFeed(res: http.ServerResponse, url: URL, feedKind: TickerFeedKind) {
  const page = parseFeedPageParams(url, { limit: 40, maxLimit: 120 });
  const days = clampInt(url.searchParams.get("days"), 1, 365, feedKind === "politicians" ? 30 : 60);

  const cacheKey = feedCacheKey({
    route: `${feedKind}_feed`,
    days,
    limit: page.limit,
    offset: page.offset,
    cursor: page.cursor ? `${page.cursor.feedAt}|${page.cursor.ticker}` : "",
  });
  const cached = readFeedResponseCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    sendJson(res, 200, cached);
    return;
  }

  const { loadFeedEntriesPage } = await import("../v2/reads.js");
  const pageData = await loadFeedEntriesPage({
    feedKind,
    limit: page.limit,
    offset: page.offset,
  });
  const body = {
    items: pageData.items,
    days,
    offset: page.offset,
    limit: page.limit,
    has_more: pageData.has_more,
    next_offset: pageData.next_offset ?? page.offset + pageData.items.length,
    next_cursor: null as string | null,
  };
  writeFeedResponseCache(cacheKey, body);
  sendJson(res, 200, body);
}

async function handlePoliticiansCluster(res: http.ServerResponse, url: URL) {
  const idRaw = url.pathname.split("/").at(-1) ?? "";
  const id = decodeURIComponent(idRaw);
  const days = clampInt(url.searchParams.get("days"), 1, 365, 30);
  const ticker = tickerFromClusterId(id);
  if (!ticker) {
    notFound(res);
    return;
  }

  if (await serveClusterSnapshotOrNull(res, { feedKind: "politicians", ticker, days })) return;

  const docs = await loadClusterDocs("politicians", ticker, days);
  if (!docs.length) {
    notFound(res);
    return;
  }

  const secTitles = await getSecTickerTitleMap();
  let minAt: string | null = null;
  let maxAt: string | null = null;
  const worksheet_rows: Array<{
    key: string;
    ts: string | null;
    amount_usd: number | null;
    amount_usd_mid: number | null;
    amount_range: string | null;
    chamber: string | null;
    committee: string | null;
    transaction_type: string | null;
    asset_name: string | null;
    description: string | null;
    ticker: string;
  }> = [];
  const politicians = new Set<string>();
  let latest: any = null;

  for (const d of docs) {
    const at = isoTimestampFromDb(d.event_at);
    if (at) {
      if (!minAt || at < minAt) minAt = at;
      if (!maxAt || at > maxAt) maxAt = at;
    }
    if (!latest) latest = d.data;
    const rows = (d.data as any)?.cluster?.worksheet_rows;
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const key = String(r?.key ?? "").trim() || "POLITICIAN";
        politicians.add(key);
        const rowTs = r?.ts != null ? String(r.ts) : at ?? null;
        worksheet_rows.push({
          key,
          ts: rowTs,
          amount_usd:
            r?.amount_usd_mid != null
              ? Number(r.amount_usd_mid)
              : r?.amount_usd != null
                ? Number(r.amount_usd)
                : null,
          amount_usd_mid: r?.amount_usd_mid != null ? Number(r.amount_usd_mid) : null,
          amount_range: r?.amount_range != null ? String(r.amount_range) : null,
          chamber: r?.chamber != null ? String(r.chamber) : null,
          committee: r?.committee != null ? String(r.committee) : null,
          transaction_type: r?.transaction_type != null ? String(r.transaction_type) : null,
          asset_name: r?.asset_name != null ? String(r.asset_name) : null,
          description: r?.description != null ? String(r.description) : null,
          ticker: r?.ticker != null ? String(r.ticker) : ticker,
        });
      }
    }
  }

  await enrichPoliticianWorksheetRows(worksheet_rows);
  worksheet_rows.sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")));
  const context_sentences: string[] = Array.isArray(latest?.cluster?.context_sentences)
    ? latest.cluster.context_sentences.map((s: any) => String(s)).filter(Boolean).slice(0, 3)
    : [];
  const issuerName = resolveResearchFeedCompanyName(ticker, secTitles.get(ticker) ?? null);

  const payload = {
    id,
    schema_type: "politician_cluster",
    schema_version: "v1",
    data: {
      schema_type: "politician_cluster",
      schema_version: "v1",
      issuer: { name: issuerName !== ticker ? issuerName : null, ticker, cik: null },
      filing: {
        form_type: "PTR",
        accession_no: latest?.filing?.accession_no ?? null,
        filed_at: maxAt,
        pdf_url: latest?.filing?.pdf_url ?? docs[0]?.url ?? null,
        url: docs[0]?.url ?? latest?.filing?.pdf_url ?? null,
      },
      cluster: {
        cluster_start_at: minAt,
        cluster_end_at: maxAt,
        feed_label: `Politician disclosures (${worksheet_rows.length})`,
        politicians: Array.from(politicians),
        context_sentences,
        worksheet_rows,
      },
    },
    url: docs[0]?.url ?? null,
  };
  cacheClusterSnapshot({ feedKind: "politicians", ticker, days, payload });
  sendJson(res, 200, payload);
}

async function handleInstitutionsCluster(res: http.ServerResponse, url: URL) {
  const idRaw = url.pathname.split("/").at(-1) ?? "";
  const id = decodeURIComponent(idRaw);
  const days = clampInt(url.searchParams.get("days"), 1, 365, 120);
  const ticker = tickerFromClusterId(id);
  if (!ticker) {
    notFound(res);
    return;
  }

  if (await serveClusterSnapshotOrNull(res, { feedKind: "institutions", ticker, days })) return;

  const docs = await loadClusterDocs("institutions", ticker, days);
  if (!docs.length) {
    notFound(res);
    return;
  }

  const secTitles = await getSecTickerTitleMap();
  const issuerName = resolveResearchFeedCompanyName(ticker, secTitles.get(ticker) ?? null);

  let minAt: string | null = null;
  let maxAt: string | null = null;
  const worksheet_rows: Array<{
    key: string;
    institution_name: string;
    activity: string | null;
    amount_usd: number | null;
    ts: string | null;
  }> = [];
  const institutions = new Set<string>();
  let latest: any = null;

  for (const d of docs) {
    const at = isoTimestampFromDb(d.event_at);
    if (at) {
      if (!minAt || at < minAt) minAt = at;
      if (!maxAt || at > maxAt) maxAt = at;
    }
    if (!latest) latest = d.data;
    const rows = (d.data as any)?.cluster?.worksheet_rows;
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const name = String(r?.institution_name ?? r?.key ?? "").trim();
        if (!name || isPlaceholderInvestorName(name)) continue;
        institutions.add(name);
        worksheet_rows.push({
          key: name,
          institution_name: name,
          activity: r?.activity != null ? String(r.activity) : null,
          amount_usd: r?.amount_usd != null ? Number(r.amount_usd) : null,
          ts: r?.ts != null ? String(r.ts) : null,
        });
      }
    }
  }

  worksheet_rows.sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")));
  const context_sentences: string[] = Array.isArray(latest?.cluster?.context_sentences)
    ? latest.cluster.context_sentences.map((s: any) => String(s)).filter(Boolean).slice(0, 3)
    : [];

  const payload = {
    id,
    schema_type: "institution_cluster",
    schema_version: "v1",
    data: {
      schema_type: "institution_cluster",
      schema_version: "v1",
      issuer: { name: issuerName, ticker, cik: null },
      filing: {
        form_type: "13F",
        accession_no: latest?.filing?.accession_no ?? null,
        filed_at: maxAt,
        index_url: latest?.filing?.index_url ?? null,
        url: docs[0]?.url ?? latest?.filing?.index_url ?? null,
      },
      cluster: {
        cluster_start_at: minAt,
        cluster_end_at: maxAt,
        feed_label: `13F holdings (${worksheet_rows.length})`,
        institutions: Array.from(institutions),
        context_sentences,
        worksheet_rows,
      },
    },
    url: docs[0]?.url ?? null,
  };
  cacheClusterSnapshot({ feedKind: "institutions", ticker, days, payload });
  sendJson(res, 200, payload);
}

async function handleInsiderCluster(res: http.ServerResponse, url: URL) {
  const id = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");

  if (isCompanyClusterId(id)) {
    const ticker = tickerFromCompanyClusterId(id);
    const days = clampInt(url.searchParams.get("days"), 1, 90, 30);
    if (!ticker) {
      notFound(res);
      return;
    }

    if (await serveClusterSnapshotOrNull(res, { feedKind: "insider", ticker, days })) return;

    const docs = await loadClusterDocs("insider", ticker, days);
    if (!docs.length) {
      notFound(res);
      return;
    }

    let minAt: string | null = null;
    let maxAt: string | null = null;
    const worksheet_rows: ReturnType<typeof normalizeInsiderWorksheetRow>[] = [];
    let totalUsd = 0;
    let latest: any = null;

    for (const d of docs) {
      const at = isoTimestampFromDb(d.event_at);
      if (at) {
        if (!minAt || at < minAt) minAt = at;
        if (!maxAt || at > maxAt) maxAt = at;
      }
      if (!latest) latest = d.data;
      const rows = (d.data as any)?.cluster?.worksheet_rows;
      if (Array.isArray(rows)) {
        for (const r of rows) {
          const normalized = normalizeInsiderWorksheetRow(r);
          worksheet_rows.push(normalized);
          const v = Number(normalized.amount_usd ?? 0);
          if (Number.isFinite(v) && v > 0) totalUsd += v;
        }
      }
    }

    worksheet_rows.sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")));
    const context_sentences: string[] = Array.isArray(latest?.cluster?.context_sentences)
      ? latest.cluster.context_sentences.map((s: any) => String(s)).filter(Boolean).slice(0, 4)
      : [];
    while (context_sentences.length < 4) context_sentences.push("");

    const feed_label =
      totalUsd > 0
        ? `Insider activity (~${formatUsdCompact(totalUsd)}, ${worksheet_rows.length} txn)`
        : `Insider transactions (${worksheet_rows.length})`;

    const payload = {
      id,
      schema_type: "insider_cluster",
      schema_version: "v1",
      data: {
        schema_type: "insider_cluster",
        schema_version: "v1",
        issuer: { name: latest?.issuer?.name ?? null, ticker, cik: latest?.issuer?.cik ?? null },
        filing: {
          form_type: "Form 4",
          accession_no: latest?.filing?.accession_no ?? null,
          filed_at: maxAt,
          pdf_url: latest?.filing?.pdf_url ?? null,
          index_url: latest?.filing?.index_url ?? null,
          url: docs[0]?.url ?? latest?.filing?.url ?? null,
        },
        cluster: { cluster_start_at: minAt, cluster_end_at: maxAt, feed_label, context_sentences, worksheet_rows },
      },
      url: docs[0]?.url ?? null,
    };
    cacheClusterSnapshot({ feedKind: "insider", ticker, days, payload });
    sendJson(res, 200, payload);
    return;
  }

  const rows = await db.query<{ id: string; data: unknown; schema_type: string; schema_version: string }>(
    `SELECT
       f.id::text,
       NULL::jsonb AS data,
       f.source_type AS schema_type,
       'v2'::text AS schema_version
     FROM filings f
     WHERE f.id = $1
     LIMIT 1`,
    [id],
  );
  if (!rows.length) {
    notFound(res);
    return;
  }
  const row = rows[0]!;
  sendJson(res, 200, {
    id,
    schema_type: row.schema_type,
    schema_version: row.schema_version,
    data: row.data,
  });
}

async function loadClusterDocs(feedKind: string, ticker: string, days: number) {
  const t = String(ticker ?? "").trim().toUpperCase();
  const filings = await db.queryApi<{
    id: string;
    event_at: string | null;
    ticker: string | null;
    url: string | null;
    pdf_url: string | null;
    accession_no: string | null;
    cik: string | null;
    issuer_name: string | null;
    issuer_id: string;
  }>(
    `
    SELECT
      f.id::text,
      f.event_at::text,
      i.ticker,
      f.url,
      f.pdf_url,
      f.accession_no,
      i.cik,
      i.name AS issuer_name,
      i.id::text AS issuer_id
    FROM filings f
    JOIN issuers i ON i.id = f.issuer_id
    WHERE f.feed_kind = $1::feed_kind
      AND i.ticker = $2
      AND f.event_at IS NOT NULL
      AND f.event_at >= now() - ($3 || ' days')::interval
    ORDER BY f.event_at DESC, f.parsed_at DESC
    LIMIT 40
    `,
    [feedKind, t, String(days)],
  );
  if (!filings.length) return [];

  const out = [];
  for (const f of filings) {
    const preview = await loadTxnPreviewForCluster(feedKind, f.issuer_id, 80);
    out.push({
      id: f.id,
      event_at: f.event_at,
      ticker: f.ticker,
      url: f.url ?? f.pdf_url,
      data: {
        issuer: { name: f.issuer_name, ticker: f.ticker, cik: f.cik },
        filing: {
          accession_no: f.accession_no,
          pdf_url: f.pdf_url,
          index_url: f.url,
          filed_at: f.event_at,
        },
        cluster: {
          worksheet_rows: preview.rows,
          context_sentences: [],
        },
      },
    });
  }
  return out;
}

async function loadTxnPreviewForCluster(feedKind: string, issuerId: string, limit: number) {
  if (feedKind === "insider") {
    const rows = await db.queryApi<any>(
      `
      SELECT f.display_name, t.role, t.transaction_code, t.acquired_disposed,
             t.amount_usd, t.shares, t.is_derivative, t.transaction_at::text AS ts
      FROM insider_transactions t
      JOIN filers f ON f.id = t.filer_id
      WHERE t.issuer_id = $1
      ORDER BY t.transaction_at DESC
      LIMIT $2
      `,
      [issuerId, limit],
    );
    return {
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
    const rows = await db.queryApi<any>(
      `
      SELECT f.display_name, t.chamber, t.committee, t.transaction_type,
             t.amount_usd, t.amount_usd_mid, t.amount_range, t.asset_name,
             t.description, t.transaction_at::text AS ts
      FROM politician_transactions t
      JOIN filers f ON f.id = t.filer_id
      WHERE t.issuer_id = $1
      ORDER BY t.transaction_at DESC
      LIMIT $2
      `,
      [issuerId, limit],
    );
    return {
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
  const rows = await db.queryApi<any>(
    `
    SELECT f.display_name, t.activity, t.amount_usd, t.shares, t.transaction_at::text AS ts
    FROM institution_transactions t
    JOIN filers f ON f.id = t.filer_id
    WHERE t.data_quality_version>=1 AND t.issuer_id = $1
    ORDER BY t.transaction_at DESC
    LIMIT $2
    `,
    [issuerId, limit],
  );
  return {
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
