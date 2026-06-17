import { db } from "../core/db.js";
import { documentAiContext, sendTickerContextEmail, type TickerAlertItem } from "./ticker-email.js";
import {
  listWatchlistSubscribersForTicker,
  logTickerAlertSent,
  tickerAlertAlreadySent,
} from "./watchlist.js";

function frontendBase(): string {
  return String(process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

type RecentDoc = {
  id: string;
  ticker: string | null;
  title: string | null;
  analysis: string | null;
  data: unknown;
  feed_kind: string | null;
  parsed_at: string | null;
  url: string | null;
  event_at: string | null;
};

async function listRecentParsedDocuments(lookbackMinutes: number): Promise<RecentDoc[]> {
  const mins = Math.max(5, Math.min(120, lookbackMinutes));
  return db.query<RecentDoc>(
    `
    SELECT
      id::text,
      upper(ticker) AS ticker,
      title,
      analysis,
      data,
      feed_kind,
      parsed_at::text,
      url,
      event_at::text
    FROM documents
    WHERE ticker IS NOT NULL
      AND trim(ticker) <> ''
      AND parsed_at IS NOT NULL
      AND parsed_at >= now() - ($1 || ' minutes')::interval
    ORDER BY parsed_at DESC
    LIMIT 200
    `,
    [String(mins)],
  );
}

function docToAlertItem(doc: RecentDoc): TickerAlertItem {
  const ticker = String(doc.ticker ?? "").trim().toUpperCase();
  const context = documentAiContext(doc);
  const base = frontendBase();
  const url = doc.url ? String(doc.url) : `${base}/?ticker=${encodeURIComponent(ticker)}`;
  return {
    id: doc.id,
    ticker,
    title: String(doc.title ?? "New filing").trim() || "New filing",
    feed: String(doc.feed_kind ?? "research"),
    context,
    url,
    event_at: String(doc.event_at ?? doc.parsed_at ?? ""),
  };
}

async function runTickerAlertsTick(): Promise<void> {
  const lookback = Number(process.env.ALERT_TICKER_LOOKBACK_MINUTES ?? 15);
  const docs = await listRecentParsedDocuments(lookback);
  if (!docs.length) return;

  const pendingByUser = new Map<string, { email: string; items: TickerAlertItem[] }>();

  for (const doc of docs) {
    const ticker = String(doc.ticker ?? "").trim().toUpperCase();
    if (!ticker) continue;
    const subscribers = await listWatchlistSubscribersForTicker(ticker);
    if (!subscribers.length) continue;
    const item = docToAlertItem(doc);
    for (const sub of subscribers) {
      if (await tickerAlertAlreadySent(sub.user_id, doc.id)) continue;
      const cur = pendingByUser.get(sub.user_id) ?? { email: sub.email, items: [] };
      cur.items.push(item);
      pendingByUser.set(sub.user_id, cur);
    }
  }

  for (const [userId, { email, items }] of pendingByUser.entries()) {
    if (!items.length) continue;
    const first = items[0];
    const subject =
      items.length === 1 && first
        ? `Mercerline · ${first.ticker} — new context`
        : `Mercerline · ${items.length} ticker alerts`;
    const ok = await sendTickerContextEmail({ to: email, subject, items });
    if (!ok) continue;
    for (const it of items) {
      await logTickerAlertSent(userId, it.id);
    }
    console.log(`[alerts] ticker alerts sent user=${userId} items=${items.length}`);
  }
}

export function startTickerAlertsWorker() {
  const pollMs = Math.max(60_000, Number(process.env.ALERTS_POLL_MS ?? 300_000));
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    if (String(process.env.ALERTS_ENABLED ?? "1").trim() === "0") return;
    running = true;
    try {
      await runTickerAlertsTick();
    } catch (e) {
      console.error("[alerts] ticker_tick_failed", e);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), pollMs);
  console.log(`[alerts] ticker worker pollMs=${pollMs}`);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
