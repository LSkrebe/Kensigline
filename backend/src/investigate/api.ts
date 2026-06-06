import type http from "node:http";
import { URL } from "node:url";
import { db } from "../core/db.js";
import { enqueueLatestForm4ForTicker } from "../core/sec.js";
import { json, notFound, route, sendJson } from "../core/http.js";
import { formatUsdCompact } from "../shared/money.js";
import {
  clampInt,
  countWorksheetEventsToday,
  isCompanyClusterId,
  latestEventAtFromDoc,
  parseEventTimeMs,
  tickerFromClusterId,
  tickerFromCompanyClusterId,
} from "../shared/feed-helpers.js";
import { normalizeInsiderWorksheetRow } from "./worksheet.js";

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
  const limit = clampInt(url.searchParams.get("limit"), 1, 200, 60);
  const days = clampInt(url.searchParams.get("days"), 1, 90, 30);

  if (mode !== "company") {
    const rows = await db.query<{
      id: string;
      event_at: string | null;
      feed_label: string | null;
      ticker: string | null;
      company_id: string | null;
    }>(
      `SELECT id, event_at, feed_label, ticker, company_id FROM documents
       WHERE feed_kind = 'insider' ORDER BY event_at DESC NULLS LAST, parsed_at DESC LIMIT $1`,
      [limit],
    );
    sendJson(res, 200, {
      items: rows.map((r) => ({
        id: r.id,
        feed_at: r.event_at,
        feed_label: r.feed_label,
        ticker: r.ticker,
        company_id: r.company_id,
      })),
    });
    return;
  }

  const docs = await db.query<{
    id: string;
    event_at: string | null;
    feed_label: string | null;
    ticker: string | null;
    company_id: string | null;
    data: any;
  }>(
    `SELECT id, event_at, feed_label, ticker, company_id, data FROM documents
     WHERE feed_kind = 'insider' AND ticker IS NOT NULL AND event_at IS NOT NULL
       AND event_at >= now() - ($1 || ' days')::interval
     ORDER BY event_at DESC, parsed_at DESC LIMIT 5000`,
    [String(days)],
  );

  type Agg = {
    ticker: string;
    company_id: string | null;
    latestFeedAt: string;
    latestDoc: (typeof docs)[number];
    totalUsd: number;
    totalCount: number;
    todayCount: number;
    insiders: Set<string>;
  };

  const byTicker = new Map<string, Agg>();

  for (const d of docs) {
    const t = String(d.ticker ?? "").trim().toUpperCase();
    const feedAt = String(d.event_at ?? "");
    if (!t || !feedAt) continue;
    const rows = (d.data as any)?.cluster?.worksheet_rows;
    let sum = 0;
    let cnt = 0;
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const v = Number(r?.amount_usd ?? 0);
        if (Number.isFinite(v) && v > 0) sum += v;
        cnt += 1;
      }
    }
    const todayDelta = countWorksheetEventsToday(rows, feedAt, "insider");
    const eventAt = latestEventAtFromDoc(rows, feedAt);
    const eventT = parseEventTimeMs(eventAt);

    const cur = byTicker.get(t);
    if (!cur) {
      const insiders = new Set<string>();
      if (Array.isArray(rows)) {
        for (const r of rows) {
          const sn = String(r?.surname ?? "").trim();
          if (sn) insiders.add(sn);
          const nm = String(r?.insider_name ?? "").trim();
          if (nm) insiders.add(nm);
          const k = String(r?.key ?? "").trim();
          if (k && k !== "Insider") insiders.add(k);
        }
      }
      byTicker.set(t, {
        ticker: t,
        company_id: d.company_id ?? null,
        latestFeedAt: eventAt,
        latestDoc: d,
        totalUsd: sum,
        totalCount: cnt,
        todayCount: todayDelta,
        insiders,
      });
      continue;
    }

    if (eventT > parseEventTimeMs(cur.latestFeedAt)) {
      cur.latestFeedAt = eventAt;
      cur.latestDoc = d;
    }
    cur.totalUsd += sum;
    cur.totalCount += cnt;
    cur.todayCount += todayDelta;
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const sn = String(r?.surname ?? "").trim();
        if (sn) cur.insiders.add(sn);
        const nm = String(r?.insider_name ?? "").trim();
        if (nm) cur.insiders.add(nm);
        const k = String(r?.key ?? "").trim();
        if (k && k !== "Insider") cur.insiders.add(k);
      }
    }
  }

  const items = Array.from(byTicker.values())
    .sort((a, b) => (a.latestFeedAt < b.latestFeedAt ? 1 : a.latestFeedAt > b.latestFeedAt ? -1 : 0))
    .slice(0, limit)
    .map((c) => {
      const usd = c.totalUsd > 0 ? formatUsdCompact(c.totalUsd) : "—";
      const todayCount = c.todayCount;
      const label =
        todayCount > 0
          ? `${usd} (${todayCount})`
          : c.totalCount > 0
            ? usd
            : (c.latestDoc.feed_label ?? "Insider activity");
      const data = c.latestDoc.data as { issuer?: { name?: string | null } } | null;
      const companyName = String(data?.issuer?.name ?? "").trim() || c.ticker;
      return {
        id: `company:${c.ticker}`,
        feed_at: c.latestFeedAt,
        feed_label: label,
        ticker: c.ticker,
        company_name: companyName,
        company_id: c.company_id,
        today_count: todayCount,
        insiders: Array.from(c.insiders).slice(0, 20),
      };
    });

  sendJson(res, 200, { items, days, mode: "company" });
}

type TickerFeedKind = "politicians" | "institutions";

async function handleTickerAggregatedFeed(res: http.ServerResponse, url: URL, feedKind: TickerFeedKind) {
  const limit = clampInt(url.searchParams.get("limit"), 1, 500, 120);
  const days = clampInt(url.searchParams.get("days"), 1, 365, feedKind === "politicians" ? 30 : 120);
  const rows = await db.query<{
    id: string;
    event_at: string | null;
    feed_label: string | null;
    ticker: string | null;
    data: any;
  }>(
    `SELECT id, event_at, feed_label, ticker, data FROM documents
     WHERE feed_kind=$3 AND event_at IS NOT NULL
       AND event_at >= now() - ($2 || ' days')::interval
     ORDER BY event_at DESC NULLS LAST, parsed_at DESC LIMIT $1`,
    [limit, String(days), feedKind],
  );

  const peopleKey = feedKind === "politicians" ? "politicians" : "institutions";
  const amountField = feedKind === "politicians" ? "amount_usd_mid" : "amount_usd";
  const nameFields =
    feedKind === "politicians"
      ? { row: "key", cluster: "politicians" }
      : { row: "institution_name", cluster: "institutions" };

  type Agg = {
    ticker: string;
    latestFeedAt: string;
    latestDoc: (typeof rows)[number];
    totalUsd: number;
    totalCount: number;
    todayCount: number;
    people: Set<string>;
  };

  const byTicker = new Map<string, Agg>();

  for (const r of rows) {
    const t = String(r.ticker ?? "").trim().toUpperCase();
    if (!t) continue;
    const at = String(r.event_at ?? "");
    const ws = (r.data as any)?.cluster?.worksheet_rows;
    const todayDelta = countWorksheetEventsToday(ws, at, feedKind);
    const eventAt = latestEventAtFromDoc(ws, at);
    const eventT = parseEventTimeMs(eventAt);
    const cur =
      byTicker.get(t) ??
      {
        ticker: t,
        latestFeedAt: eventAt,
        latestDoc: r,
        totalUsd: 0,
        totalCount: 0,
        todayCount: 0,
        people: new Set<string>(),
      };
    if (eventT > parseEventTimeMs(cur.latestFeedAt)) {
      cur.latestFeedAt = eventAt;
      cur.latestDoc = r;
    }
    cur.todayCount += todayDelta;
    if (Array.isArray(ws)) {
      for (const w of ws) {
        const mid = Number(w?.[amountField] ?? w?.amount_usd ?? 0);
        if (Number.isFinite(mid) && mid > 0) cur.totalUsd += mid;
        cur.totalCount += 1;
        const who = String(w?.[nameFields.row] ?? w?.key ?? "").trim();
        if (who) cur.people.add(who);
      }
    }
    const ps = (r.data as any)?.cluster?.[nameFields.cluster];
    if (Array.isArray(ps)) for (const p of ps) if (p) cur.people.add(String(p));
    byTicker.set(t, cur);
  }

  const items = Array.from(byTicker.values())
    .sort((a, b) => (a.latestFeedAt < b.latestFeedAt ? 1 : a.latestFeedAt > b.latestFeedAt ? -1 : 0))
    .slice(0, limit)
    .map((c) => {
      const usd = c.totalUsd > 0 ? formatUsdCompact(c.totalUsd) : "—";
      const todayCount = c.todayCount;
      const label = todayCount > 0 ? `${usd} (${todayCount})` : usd;
      const data = c.latestDoc.data as { issuer?: { name?: string | null } } | null;
      const companyName = String(data?.issuer?.name ?? "").trim() || c.ticker;
      return {
        id: `ticker:${c.ticker}`,
        feed_at: c.latestFeedAt,
        feed_label: label,
        ticker: c.ticker,
        company_name: companyName,
        today_count: todayCount,
        [peopleKey]: Array.from(c.people).slice(0, 20),
      };
    });

  sendJson(res, 200, { items, days, mode: "ticker" });
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

  const docs = await loadClusterDocs("politicians", ticker, days);
  if (!docs.length) {
    notFound(res);
    return;
  }

  let minAt: string | null = null;
  let maxAt: string | null = null;
  const worksheet_rows: Array<{
    key: string;
    ts: string | null;
    amount_usd: number | null;
    chamber: string | null;
    transaction_type: string | null;
  }> = [];
  const politicians = new Set<string>();
  let latest: any = null;

  for (const d of docs) {
    const at = d.event_at ? String(d.event_at) : null;
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
        worksheet_rows.push({
          key,
          ts: r?.ts != null ? String(r.ts) : null,
          amount_usd: r?.amount_usd_mid != null ? Number(r.amount_usd_mid) : null,
          chamber: r?.chamber != null ? String(r.chamber) : null,
          transaction_type: r?.transaction_type != null ? String(r.transaction_type) : null,
        });
      }
    }
  }

  worksheet_rows.sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")));
  const context_sentences: string[] = Array.isArray(latest?.cluster?.context_sentences)
    ? latest.cluster.context_sentences.map((s: any) => String(s)).filter(Boolean).slice(0, 3)
    : [];

  sendJson(res, 200, {
    id,
    schema_type: "politician_cluster",
    schema_version: "v1",
    data: {
      schema_type: "politician_cluster",
      schema_version: "v1",
      issuer: { name: null, ticker, cik: null },
      filing: { form_type: "PTR", accession_no: null, filed_at: maxAt },
      cluster: {
        cluster_start_at: minAt,
        cluster_end_at: maxAt,
        feed_label: `Politician purchases (${worksheet_rows.length})`,
        politicians: Array.from(politicians),
        context_sentences,
        worksheet_rows,
      },
    },
  });
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

  const docs = await loadClusterDocs("institutions", ticker, days);
  if (!docs.length) {
    notFound(res);
    return;
  }

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
    const at = d.event_at ? String(d.event_at) : null;
    if (at) {
      if (!minAt || at < minAt) minAt = at;
      if (!maxAt || at > maxAt) maxAt = at;
    }
    if (!latest) latest = d.data;
    const rows = (d.data as any)?.cluster?.worksheet_rows;
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const name = String(r?.institution_name ?? r?.key ?? "").trim() || "Institution";
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

  sendJson(res, 200, {
    id,
    schema_type: "institution_cluster",
    schema_version: "v1",
    data: {
      schema_type: "institution_cluster",
      schema_version: "v1",
      issuer: { name: null, ticker, cik: null },
      filing: { form_type: "13F", accession_no: null, filed_at: maxAt },
      cluster: {
        cluster_start_at: minAt,
        cluster_end_at: maxAt,
        feed_label: `13F holdings (${worksheet_rows.length})`,
        institutions: Array.from(institutions),
        context_sentences,
        worksheet_rows,
      },
    },
  });
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
      const at = d.event_at ? String(d.event_at) : null;
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
        ? `Net buying ~${formatUsdCompact(totalUsd)} (P purchases, ${worksheet_rows.length})`
        : `Insider P purchases (${worksheet_rows.length})`;

    sendJson(res, 200, {
      id,
      schema_type: "insider_cluster",
      schema_version: "v1",
      data: {
        schema_type: "insider_cluster",
        schema_version: "v1",
        issuer: { name: latest?.issuer?.name ?? null, ticker, cik: latest?.issuer?.cik ?? null },
        filing: { form_type: "Form 4", accession_no: null, filed_at: maxAt },
        cluster: { cluster_start_at: minAt, cluster_end_at: maxAt, feed_label, context_sentences, worksheet_rows },
      },
    });
    return;
  }

  const rows = await db.query<{ id: string; data: unknown; schema_type: string; schema_version: string }>(
    `SELECT id, data, doc_kind AS schema_type, schema_version FROM documents WHERE id = $1 LIMIT 1`,
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
  return db.query<{ id: string; event_at: string | null; ticker: string | null; data: any }>(
    `SELECT id, event_at, ticker, data FROM documents
     WHERE feed_kind=$1 AND ticker=$2 AND event_at IS NOT NULL
       AND event_at >= now() - ($3 || ' days')::interval
     ORDER BY event_at DESC, parsed_at DESC LIMIT 5000`,
    [feedKind, ticker, String(days)],
  );
}
