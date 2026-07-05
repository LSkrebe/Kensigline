import type http from "node:http";
import { db } from "../core/db.js";
import { sendJson } from "../core/http.js";
import { getLatestOutcomes } from "../core/outcomes.js";
import { loadPaperDocumentsForTicker } from "../documents/store.js";
import { resolveResearchFeedCompanyName } from "../research/feed-display.js";
import { getSecTickerTitleMap } from "../core/sec.js";
import { loadUpcomingMacroDays } from "../discover/macro.js";

const TICKER_RE = /^[A-Z0-9.-]{1,12}$/;
const VISIBLE_EVENTS = 3;

type EventKind = "catalyst" | "filing" | "flow";

function mapSourceToKind(source: string): EventKind {
  const s = String(source ?? "").toLowerCase();
  if (/form\s*[345]|ptr|13f|insider|politician|institution|flow/.test(s)) return "flow";
  if (/press|transcript|earnings|catalyst|gov contract/.test(s)) return "catalyst";
  return "filing";
}

function eventTitleFromAnalysis(analysis: string, source: string) {
  const body = String(analysis ?? "").trim();
  if (!body) return String(source ?? "Event").trim() || "Event";
  const first = body.split(/\n+/)[0]?.trim() ?? body;
  if (first.length <= 96) return first;
  const cut = first.slice(0, 95).trim();
  return cut.endsWith(".") ? cut : `${cut}…`;
}

function formatEarningsLabel(iso: string | null) {
  const raw = String(iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const daysUntil = (d.getTime() - Date.now()) / 86_400_000;
  return { label, soon: daysUntil >= 0 && daysUntil <= 21 };
}

function formatAsOfLabel(day: string | null) {
  const raw = String(day ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "—";
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtPct(r: number | null | undefined) {
  if (r == null || !Number.isFinite(r)) return "—";
  const sign = r >= 0 ? "+" : "";
  return `${sign}${(r * 100).toFixed(1)}%`;
}

function buildStats(insider: { data?: any } | null, research: { data?: any } | null) {
  const stats: Array<{ label: string; value: string }> = [];
  const ins = insider?.data;
  const res = research?.data;
  if (ins) {
    const win = ins.winRate != null ? String(ins.winRate) : "—";
    const med = ins.medianReturn != null ? String(ins.medianReturn) : "—";
    stats.push({ label: "Insider flow (21d)", value: `${win} win · ${med} med` });
  }
  if (res) {
    const med = res.medianReturn != null ? String(res.medianReturn) : "—";
    const win = res.winRate != null ? String(res.winRate) : "—";
    stats.push({ label: "Research signals (21d)", value: `${win} win · ${med} med` });
  }
  if (res?.avgReturn63 != null && Number.isFinite(Number(res.avgReturn63))) {
    stats.push({ label: "Post-signal drift (63d)", value: `${fmtPct(Number(res.avgReturn63))} avg` });
  } else if (ins?.avgReturn63 != null && Number.isFinite(Number(ins.avgReturn63))) {
    stats.push({ label: "Post-flow drift (63d)", value: `${fmtPct(Number(ins.avgReturn63))} avg` });
  }
  return stats.slice(0, 3);
}

async function tickerExists(ticker: string) {
  const row = await db.one<{ ok: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1 FROM companies WHERE ticker = $1
      UNION ALL
      SELECT 1 FROM documents WHERE upper(trim(ticker)) = $1 LIMIT 1
    ) AS ok
    `,
    [ticker],
  );
  return Boolean(row?.ok);
}

async function loadSparkline(ticker: string) {
  const rows = await db.query<{ day: string; close: number }>(
    `
    SELECT day::text AS day, close
    FROM bars
    WHERE ticker = $1
    ORDER BY day DESC
    LIMIT 400
    `,
    [ticker],
  );
  if (!rows.length) return { sparkline: [] as number[], asOfDay: null as string | null };
  const ordered = [...rows].reverse();
  return {
    sparkline: ordered.map((r) => Number(r.close)).filter((n) => Number.isFinite(n)),
    asOfDay: ordered[ordered.length - 1]?.day ?? null,
  };
}

async function countTimelineItems(ticker: string) {
  const row = await db.one<{ n: string }>(
    `
    SELECT COUNT(*)::text AS n
    FROM documents
    WHERE upper(trim(ticker)) = $1
      AND (
        feed_kind IN ('insider', 'politicians', 'institutions')
        OR (
          feed_kind = 'research'
          AND analysis IS NOT NULL
          AND length(trim(analysis)) > 0
          AND show_on_ticker IS NOT FALSE
        )
      )
    `,
    [ticker],
  );
  return Number(row?.n) || 0;
}

async function pickMacro() {
  try {
    const days = await loadUpcomingMacroDays(5);
    for (const day of days) {
      const events = Array.isArray(day.events) ? day.events : [];
      const high = events.find((e) => e.impact === "high") ?? events[0];
      if (!high) continue;
      const time = String(high.time ?? "").trim();
      return {
        time: time ? `${time} ET` : "—",
        title: String(high.title ?? "").trim() || "Macro release",
        region: String(high.region ?? "US"),
        impact: high.impact === "medium" || high.impact === "low" ? high.impact : "high",
      };
    }
  } catch {
    // optional
  }
  return null;
}

export async function handlePublicTeaser(res: http.ServerResponse, tickerRaw: string) {
  const ticker = String(tickerRaw ?? "").trim().toUpperCase();
  if (!ticker || !TICKER_RE.test(ticker)) {
    sendJson(res, 400, { ok: false, error: "ticker_invalid" });
    return;
  }

  if (!(await tickerExists(ticker))) {
    sendJson(res, 404, { ok: false, error: "ticker_not_found" });
    return;
  }

  const [companyRow, secTitles, documents, spark, totalItems, insiderOutcomes, researchOutcomes, macro] =
    await Promise.all([
      db.one<{
        name: string | null;
        industry: string | null;
        country: string | null;
        mcap: string | null;
        earnings_date: string | null;
      }>(
        `
        SELECT name, industry, country, mcap, earnings_date::text AS earnings_date
        FROM companies
        WHERE ticker = $1
        LIMIT 1
        `,
        [ticker],
      ),
      getSecTickerTitleMap().catch(() => new Map<string, string>()),
      loadPaperDocumentsForTicker(ticker, 40),
      loadSparkline(ticker),
      countTimelineItems(ticker),
      getLatestOutcomes("insider").catch(() => null),
      getLatestOutcomes("research").catch(() => null),
      pickMacro(),
    ]);

  const companyName = resolveResearchFeedCompanyName(ticker, companyRow?.name, secTitles.get(ticker) ?? null);

  const sparkline = spark.sparkline;
  const price = sparkline.length ? sparkline[sparkline.length - 1]! : null;
  const prev = sparkline.length > 1 ? sparkline[sparkline.length - 2]! : price;
  const change = price != null && prev != null ? Math.round((price - prev) * 100) / 100 : 0;
  const changePct =
    price != null && prev != null && prev !== 0
      ? Math.round(((price - prev) / Math.abs(prev)) * 10000) / 100
      : 0;

  const events = documents.slice(0, VISIBLE_EVENTS).map((doc) => ({
    id: doc.id,
    atIso: doc.filedAt,
    source: doc.source,
    kind: mapSourceToKind(doc.source),
    title: eventTitleFromAnalysis(doc.analysis, doc.source),
    summary: doc.analysis,
    ideaBest: Boolean(doc.idea_best),
    url: doc.url,
  }));

  const lockedCount = Math.max(0, totalItems - VISIBLE_EVENTS);

  sendJson(res, 200, {
    ok: true,
    preview: {
      mode: "delayed",
      delayLabel: "EOD",
      delayNote: "Public teaser uses end-of-day prices and a limited event sample.",
      ticker,
      company: companyName,
      sector: String(companyRow?.industry ?? "—").trim() || "—",
      country: String(companyRow?.country ?? "United States").trim() || "United States",
      mcap: String(companyRow?.mcap ?? "—").trim() || "—",
      price: price ?? 0,
      change,
      changePct,
      asOfLabel: formatAsOfLabel(spark.asOfDay),
      earnings: formatEarningsLabel(companyRow?.earnings_date ?? null),
      macro,
      events,
      lockedCount,
      stats: buildStats(insiderOutcomes, researchOutcomes),
    },
    sparkline,
  });
}
