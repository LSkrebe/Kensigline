import { db } from "../core/db.js";
import {
  isIdeaGreenHighlight,
  scoreInsiderCluster,
  scoreInstitutionCluster,
  scorePoliticianCluster,
} from "../core/idea-score.js";
import {
  countWorksheetEventsToday,
  latestEventAtFromDoc,
  parseEventTimeMs,
} from "../shared/feed-helpers.js";
import { normalizeResearchPaperSourceKey } from "../shared/source-keys.js";
import {
  discoverEventIsMarketMove,
  discoverSummaryText,
  inferIntelMode,
  isoDayStart,
  type DocumentDiscoverRow,
} from "./map.js";
import { loadPastDiscoverEvents } from "./past.js";
import type { DiscoverEvent } from "./types.js";

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function flowDocToRow(doc: {
  id: string;
  ticker: string;
  event_at: string | null;
  title?: string | null;
  feed_label?: string | null;
  source_key: string | null;
  feed_kind: string;
  analysis?: string | null;
  url: string | null;
  data: unknown;
  company_name?: string | null;
  program_drug?: string | null;
  program_phase?: string | null;
  industry?: string | null;
}): DocumentDiscoverRow {
  return {
    id: doc.id,
    ticker: String(doc.ticker ?? "").trim().toUpperCase(),
    company_name: doc.company_name ?? null,
    event_at: String(doc.event_at ?? ""),
    title: doc.title ?? doc.feed_label ?? null,
    source_key: doc.source_key,
    feed_kind: doc.feed_kind,
    analysis: doc.analysis ?? null,
    url: doc.url,
    program_drug: doc.program_drug ?? null,
    program_phase: doc.program_phase ?? null,
    industry: doc.industry ?? null,
    data: doc.data,
  };
}

function flowAggToDiscoverEvent(args: {
  ticker: string;
  companyName: string;
  latestFeedAt: string;
  latestDoc: Parameters<typeof flowDocToRow>[0];
  sourceKey: string;
  idea: { idea_score: number; idea_best: boolean; idea_reasons: string[] };
}): DiscoverEvent | null {
  const row = flowDocToRow(args.latestDoc);
  const summary = discoverSummaryText(row);
  if (!summary || !isIdeaGreenHighlight(args.idea)) return null;

  const source = normalizeResearchPaperSourceKey(args.sourceKey);
  const title =
    String(row.title ?? "").trim() ||
    String(args.latestDoc.feed_label ?? "").trim() ||
    source ||
    "Flow activity";

  return {
    id: `doc:${row.id}`,
    ticker: args.ticker,
    companyName: args.companyName,
    intelMode: inferIntelMode(row.feed_kind, row.industry),
    at: isoDayStart(args.latestFeedAt),
    title,
    kind: "flow",
    source,
    summary,
    url: row.url,
    idea_score: args.idea.idea_score,
    idea_best: args.idea.idea_best,
    idea_reasons: args.idea.idea_reasons,
  };
}

async function loadHighlightedInsiderMoves(days: number, cap: number): Promise<DiscoverEvent[]> {
  const docs = await db.query<{
    id: string;
    event_at: string | null;
    feed_label: string | null;
    ticker: string | null;
    data: any;
    url: string | null;
    source_key: string | null;
  }>(
    `SELECT id, event_at, feed_label, ticker, data, url, source_key FROM documents
     WHERE feed_kind = 'insider' AND ticker IS NOT NULL AND event_at IS NOT NULL
       AND event_at >= now() - ($1 || ' days')::interval
     ORDER BY event_at DESC, parsed_at DESC LIMIT 5000`,
    [String(days)],
  );

  type Agg = {
    ticker: string;
    latestFeedAt: string;
    latestDoc: (typeof docs)[number];
    totalUsd: number;
    todayCount: number;
  };

  const byTicker = new Map<string, Agg>();

  for (const d of docs) {
    const t = String(d.ticker ?? "").trim().toUpperCase();
    const feedAt = String(d.event_at ?? "");
    if (!t || !feedAt) continue;
    const rows = (d.data as any)?.cluster?.worksheet_rows;
    let sum = 0;
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const v = Number(r?.amount_usd ?? 0);
        if (Number.isFinite(v) && v > 0) sum += v;
      }
    }
    const todayDelta = countWorksheetEventsToday(rows, feedAt, "insider");
    const eventAt = latestEventAtFromDoc(rows, feedAt);
    const eventT = parseEventTimeMs(eventAt);

    const cur = byTicker.get(t);
    if (!cur) {
      byTicker.set(t, {
        ticker: t,
        latestFeedAt: eventAt,
        latestDoc: d,
        totalUsd: sum,
        todayCount: todayDelta,
      });
      continue;
    }

    if (eventT > parseEventTimeMs(cur.latestFeedAt)) {
      cur.latestFeedAt = eventAt;
      cur.latestDoc = d;
    }
    cur.totalUsd += sum;
    cur.todayCount += todayDelta;
  }

  const out: DiscoverEvent[] = [];
  for (const c of byTicker.values()) {
    const idea = scoreInsiderCluster({
      data: c.latestDoc.data,
      eventAt: c.latestFeedAt,
      todayCount: c.todayCount,
      totalUsd: c.totalUsd,
    });
    const data = c.latestDoc.data as { issuer?: { name?: string | null } } | null;
    const companyName = String(data?.issuer?.name ?? "").trim() || c.ticker;
    const event = flowAggToDiscoverEvent({
      ticker: c.ticker,
      companyName,
      latestFeedAt: c.latestFeedAt,
      latestDoc: { ...c.latestDoc, feed_kind: "insider", ticker: c.ticker },
      sourceKey: c.latestDoc.source_key ?? "Form 4",
      idea,
    });
    if (event) out.push(event);
  }

  return out.slice(0, cap);
}

async function loadHighlightedPoliticianMoves(days: number, cap: number): Promise<DiscoverEvent[]> {
  const rows = await db.query<{
    id: string;
    event_at: string | null;
    feed_label: string | null;
    ticker: string | null;
    data: any;
    url: string | null;
    source_key: string | null;
  }>(
    `SELECT id, event_at, feed_label, ticker, data, url, source_key FROM documents
     WHERE feed_kind = 'politicians' AND ticker IS NOT NULL AND event_at IS NOT NULL
       AND event_at >= now() - ($1 || ' days')::interval
     ORDER BY event_at DESC NULLS LAST, parsed_at DESC LIMIT 5000`,
    [String(days)],
  );

  type Agg = {
    ticker: string;
    latestFeedAt: string;
    latestDoc: (typeof rows)[number];
    totalUsd: number;
    todayCount: number;
  };

  const byTicker = new Map<string, Agg>();

  for (const r of rows) {
    const t = String(r.ticker ?? "").trim().toUpperCase();
    if (!t) continue;
    const at = String(r.event_at ?? "");
    const ws = (r.data as any)?.cluster?.worksheet_rows;
    const todayDelta = countWorksheetEventsToday(ws, at, "politicians");
    const eventAt = latestEventAtFromDoc(ws, at);
    const eventT = parseEventTimeMs(eventAt);
    const cur =
      byTicker.get(t) ??
      {
        ticker: t,
        latestFeedAt: eventAt,
        latestDoc: r,
        totalUsd: 0,
        todayCount: 0,
      };
    if (eventT > parseEventTimeMs(cur.latestFeedAt)) {
      cur.latestFeedAt = eventAt;
      cur.latestDoc = r;
    }
    cur.todayCount += todayDelta;
    if (Array.isArray(ws)) {
      for (const w of ws) {
        const mid = Number(w?.amount_usd_mid ?? w?.amount_usd ?? 0);
        if (Number.isFinite(mid) && mid > 0) cur.totalUsd += mid;
      }
    }
    byTicker.set(t, cur);
  }

  const out: DiscoverEvent[] = [];
  for (const c of byTicker.values()) {
    const idea = scorePoliticianCluster({
      data: c.latestDoc.data,
      eventAt: c.latestFeedAt,
      todayCount: c.todayCount,
      totalUsd: c.totalUsd,
    });
    const data = c.latestDoc.data as { issuer?: { name?: string | null } } | null;
    const companyName = String(data?.issuer?.name ?? "").trim() || c.ticker;
    const event = flowAggToDiscoverEvent({
      ticker: c.ticker,
      companyName,
      latestFeedAt: c.latestFeedAt,
      latestDoc: { ...c.latestDoc, feed_kind: "politicians", ticker: c.ticker },
      sourceKey: c.latestDoc.source_key ?? "PTR",
      idea,
    });
    if (event) out.push(event);
  }

  return out.slice(0, cap);
}

async function loadHighlightedInstitutionMoves(days: number, cap: number): Promise<DiscoverEvent[]> {
  const rows = await db.query<{
    id: string;
    event_at: string | null;
    feed_label: string | null;
    ticker: string | null;
    data: any;
    url: string | null;
    source_key: string | null;
  }>(
    `SELECT id, event_at, feed_label, ticker, data, url, source_key FROM documents
     WHERE feed_kind = 'institutions' AND ticker IS NOT NULL AND event_at IS NOT NULL
       AND event_at >= now() - ($1 || ' days')::interval
     ORDER BY event_at DESC NULLS LAST, parsed_at DESC LIMIT 5000`,
    [String(days)],
  );

  type Agg = {
    ticker: string;
    latestFeedAt: string;
    latestDoc: (typeof rows)[number];
    totalUsd: number;
    todayCount: number;
  };

  const byTicker = new Map<string, Agg>();

  for (const r of rows) {
    const t = String(r.ticker ?? "").trim().toUpperCase();
    if (!t) continue;
    const at = String(r.event_at ?? "");
    const ws = (r.data as any)?.cluster?.worksheet_rows;
    const todayDelta = countWorksheetEventsToday(ws, at, "institutions");
    const eventAt = latestEventAtFromDoc(ws, at);
    const eventT = parseEventTimeMs(eventAt);
    const cur =
      byTicker.get(t) ??
      {
        ticker: t,
        latestFeedAt: eventAt,
        latestDoc: r,
        totalUsd: 0,
        todayCount: 0,
      };
    if (eventT > parseEventTimeMs(cur.latestFeedAt)) {
      cur.latestFeedAt = eventAt;
      cur.latestDoc = r;
    }
    cur.todayCount += todayDelta;
    if (Array.isArray(ws)) {
      for (const w of ws) {
        const mid = Number(w?.amount_usd ?? 0);
        if (Number.isFinite(mid) && mid > 0) cur.totalUsd += mid;
      }
    }
    byTicker.set(t, cur);
  }

  const out: DiscoverEvent[] = [];
  for (const c of byTicker.values()) {
    const idea = scoreInstitutionCluster({
      data: c.latestDoc.data,
      eventAt: c.latestFeedAt,
      todayCount: c.todayCount,
      totalUsd: c.totalUsd,
    });
    const data = c.latestDoc.data as { issuer?: { name?: string | null } } | null;
    const companyName = String(data?.issuer?.name ?? "").trim() || c.ticker;
    const event = flowAggToDiscoverEvent({
      ticker: c.ticker,
      companyName,
      latestFeedAt: c.latestFeedAt,
      latestDoc: { ...c.latestDoc, feed_kind: "institutions", ticker: c.ticker },
      sourceKey: c.latestDoc.source_key ?? "13F",
      idea,
    });
    if (event) out.push(event);
  }

  return out.slice(0, cap);
}

function dayStartMs(at: string) {
  const raw = String(at ?? "").trim();
  const d = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return NaN;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Green-highlight rows aligned with Investigate feed aggregation (not per-doc past calendar). */
export async function loadHighlightedMarketMoves(opts: {
  pastDays?: number;
  limit?: number;
}): Promise<DiscoverEvent[]> {
  const days = clampInt(opts.pastDays, 7, 365, 90);
  const limit = clampInt(opts.limit, 10, 200, 80);
  const perFeed = Math.max(20, Math.ceil(limit / 2));

  const [insider, politicians, institutions, pastResearch] = await Promise.all([
    loadHighlightedInsiderMoves(Math.min(days, 30), perFeed),
    loadHighlightedPoliticianMoves(Math.min(days, 30), perFeed),
    loadHighlightedInstitutionMoves(days, perFeed),
    loadPastDiscoverEvents({ pastDays: days, limit: 200 }),
  ]);

  const research = pastResearch.filter(discoverEventIsMarketMove);
  const merged = [...insider, ...politicians, ...institutions, ...research];
  merged.sort((a, b) => dayStartMs(b.at) - dayStartMs(a.at));
  return merged.slice(0, limit);
}
