import { db } from "../core/db.js";
import { actorModeLabel } from "./actor-key.js";
import type { ActorAlertItem } from "./actor-email.js";
import { sendCombinedContextEmail } from "./context-email.js";
import { canSendContextEmail, logContextEmailSent } from "./context-email-limit.js";
import {
  actorAlertAlreadySent,
  listActorKeysForDocument,
  listActorWatchlistSubscribers,
  logActorAlertSent,
} from "./actor-watchlist.js";
import { documentAiContext } from "./ticker-email.js";
import type { TickerAlertItem } from "./ticker-email.js";
import {
  listWatchlistSubscribersForTicker,
  logTickerAlertSent,
  tickerAlertAlreadySent,
} from "./watchlist.js";

function frontendBase(): string {
  return String(process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

function contextLookbackMinutes(): number {
  const pollMin = Math.max(15, Math.round(contextPollMs() / 60_000));
  const n = Number(process.env.ALERT_CONTEXT_LOOKBACK_MINUTES ?? pollMin + 5);
  if (!Number.isFinite(n)) return pollMin + 5;
  return Math.max(pollMin, Math.min(180, Math.round(n)));
}

function contextPollMs(): number {
  const n = Number(process.env.ALERT_CONTEXT_POLL_MS ?? 1_800_000);
  if (!Number.isFinite(n)) return 1_800_000;
  return Math.max(300_000, Math.min(3_600_000, Math.round(n)));
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

type PendingUser = {
  email: string;
  timezone: string;
  tickers: TickerAlertItem[];
  actors: ActorAlertItem[];
};

async function listRecentParsedDocuments(lookbackMinutes: number): Promise<RecentDoc[]> {
  const mins = Math.max(5, Math.min(180, lookbackMinutes));
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
    WHERE parsed_at IS NOT NULL
      AND parsed_at >= now() - ($1 || ' minutes')::interval
    ORDER BY parsed_at DESC
    LIMIT 300
    `,
    [String(mins)],
  );
}

function docToTickerItem(doc: RecentDoc): TickerAlertItem {
  const ticker = String(doc.ticker ?? "").trim().toUpperCase();
  const base = frontendBase();
  return {
    id: doc.id,
    ticker,
    title: String(doc.title ?? "New filing").trim() || "New filing",
    feed: String(doc.feed_kind ?? "research"),
    context: documentAiContext(doc),
    url: doc.url ? String(doc.url) : `${base}/?ticker=${encodeURIComponent(ticker)}`,
    event_at: String(doc.event_at ?? doc.parsed_at ?? ""),
  };
}

function docToActorItem(
  doc: RecentDoc,
  actor: { actor_key: string; display_name: string; mode: string },
): ActorAlertItem {
  const ticker = String(doc.ticker ?? "").trim().toUpperCase();
  const base = frontendBase();
  return {
    id: doc.id,
    actor_key: actor.actor_key,
    actor_name: actor.display_name,
    mode: actor.mode,
    ticker: ticker || "—",
    title: String(doc.title ?? "New transaction").trim() || "New transaction",
    context: documentAiContext(doc),
    url: doc.url ? String(doc.url) : `${base}/?tab=investigate`,
    event_at: String(doc.event_at ?? doc.parsed_at ?? ""),
  };
}

function buildSubject(tickers: TickerAlertItem[], actors: ActorAlertItem[]): string {
  const total = tickers.length + actors.length;
  if (total === 1) {
    if (tickers[0]) return `Mercerline · ${tickers[0].ticker} - new context`;
    if (actors[0]) {
      return `Mercerline · ${actors[0].actor_name} - new ${actorModeLabel(actors[0].mode).toLowerCase()} activity`;
    }
  }
  return `Mercerline · ${total} watchlist alerts`;
}

async function collectPendingByUser(docs: RecentDoc[]): Promise<Map<string, PendingUser>> {
  const pending = new Map<string, PendingUser>();

  for (const doc of docs) {
    const ticker = String(doc.ticker ?? "").trim().toUpperCase();
    if (ticker) {
      const subscribers = await listWatchlistSubscribersForTicker(ticker);
      const item = docToTickerItem(doc);
      for (const sub of subscribers) {
        if (await tickerAlertAlreadySent(sub.user_id, doc.id)) continue;
        const cur = pending.get(sub.user_id) ?? {
          email: sub.email,
          timezone: sub.timezone ?? "UTC",
          tickers: [],
          actors: [],
        };
        cur.timezone = sub.timezone ?? cur.timezone;
        cur.tickers.push(item);
        pending.set(sub.user_id, cur);
      }
    }

    const actors = await listActorKeysForDocument(doc.id);
    for (const actor of actors) {
      const subscribers = await listActorWatchlistSubscribers(actor.actor_key);
      const item = docToActorItem(doc, actor);
      for (const sub of subscribers) {
        if (await actorAlertAlreadySent(sub.user_id, doc.id, actor.actor_key)) continue;
        const cur = pending.get(sub.user_id) ?? {
          email: sub.email,
          timezone: sub.timezone ?? "UTC",
          tickers: [],
          actors: [],
        };
        cur.timezone = sub.timezone ?? cur.timezone;
        cur.actors.push(item);
        pending.set(sub.user_id, cur);
      }
    }
  }

  return pending;
}

async function runContextAlertsTick(): Promise<void> {
  const lookback = contextLookbackMinutes();
  const docs = await listRecentParsedDocuments(lookback);
  if (!docs.length) return;

  const pendingByUser = await collectPendingByUser(docs);

  for (const [userId, pending] of pendingByUser.entries()) {
    const { tickers, actors, email, timezone } = pending;
    const itemCount = tickers.length + actors.length;
    if (!itemCount) continue;

    const budget = await canSendContextEmail(userId, timezone);
    if (!budget.ok) {
      console.log(
        `[alerts] context cap reached user=${userId} sent=${budget.sent}/${budget.max} date=${budget.dateKey}`,
      );
      continue;
    }

    const subject = buildSubject(tickers, actors);
    const ok = await sendCombinedContextEmail({ to: email, subject, tickers, actors });
    if (!ok) continue;

    for (const it of tickers) await logTickerAlertSent(userId, it.id);
    for (const it of actors) await logActorAlertSent(userId, it.id, it.actor_key);
    await logContextEmailSent(userId, budget.dateKey, itemCount);

    console.log(
      `[alerts] context email sent user=${userId} tickers=${tickers.length} actors=${actors.length} daily=${budget.sent + 1}/${budget.max}`,
    );
  }
}

export function startContextAlertsWorker() {
  const pollMs = contextPollMs();
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    if (String(process.env.ALERTS_ENABLED ?? "1").trim() === "0") return;
    running = true;
    try {
      await runContextAlertsTick();
    } catch (e) {
      console.error("[alerts] context_tick_failed", e);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), pollMs);
  console.log(`[alerts] context worker pollMs=${pollMs} lookbackMin=${contextLookbackMinutes()}`);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
