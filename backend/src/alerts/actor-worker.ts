import { db } from "../core/db.js";
import { actorModeLabel } from "./actor-key.js";
import { sendActorContextEmail, type ActorAlertItem } from "./actor-email.js";
import { documentAiContext } from "./ticker-email.js";
import {
  actorAlertAlreadySent,
  listActorKeysForDocument,
  listActorWatchlistSubscribers,
  logActorAlertSent,
} from "./actor-watchlist.js";

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
    WHERE parsed_at IS NOT NULL
      AND parsed_at >= now() - ($1 || ' minutes')::interval
    ORDER BY parsed_at DESC
    LIMIT 200
    `,
    [String(mins)],
  );
}

function docToActorAlertItem(
  doc: RecentDoc,
  actor: { actor_key: string; display_name: string; mode: string },
): ActorAlertItem {
  const ticker = String(doc.ticker ?? "").trim().toUpperCase();
  const context = documentAiContext(doc);
  const base = frontendBase();
  const url = doc.url ? String(doc.url) : `${base}/?tab=investigate`;
  return {
    id: doc.id,
    actor_key: actor.actor_key,
    actor_name: actor.display_name,
    mode: actor.mode,
    ticker: ticker || "—",
    title: String(doc.title ?? "New transaction").trim() || "New transaction",
    context,
    url,
    event_at: String(doc.event_at ?? doc.parsed_at ?? ""),
  };
}

async function runActorAlertsTick(): Promise<void> {
  const lookback = Number(process.env.ALERT_TICKER_LOOKBACK_MINUTES ?? 15);
  const docs = await listRecentParsedDocuments(lookback);
  if (!docs.length) return;

  const pendingByUser = new Map<string, { email: string; items: ActorAlertItem[] }>();

  for (const doc of docs) {
    const actors = await listActorKeysForDocument(doc.id);
    if (!actors.length) continue;

    for (const actor of actors) {
      const subscribers = await listActorWatchlistSubscribers(actor.actor_key);
      if (!subscribers.length) continue;
      const item = docToActorAlertItem(doc, actor);
      for (const sub of subscribers) {
        if (await actorAlertAlreadySent(sub.user_id, doc.id, actor.actor_key)) continue;
        const cur = pendingByUser.get(sub.user_id) ?? { email: sub.email, items: [] };
        cur.items.push(item);
        pendingByUser.set(sub.user_id, cur);
      }
    }
  }

  for (const [userId, { email, items }] of pendingByUser.entries()) {
    if (!items.length) continue;
    const first = items[0];
    const subject =
      items.length === 1 && first
        ? `Mercerline · ${first.actor_name} - new ${actorModeLabel(first.mode).toLowerCase()} activity`
        : `Mercerline · ${items.length} actor alerts`;
    const ok = await sendActorContextEmail({ to: email, subject, items });
    if (!ok) continue;
    for (const it of items) {
      await logActorAlertSent(userId, it.id, it.actor_key);
    }
    console.log(`[alerts] actor alerts sent user=${userId} items=${items.length}`);
  }
}

export function startActorAlertsWorker() {
  const pollMs = Math.max(60_000, Number(process.env.ALERTS_POLL_MS ?? 300_000));
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    if (String(process.env.ALERTS_ENABLED ?? "1").trim() === "0") return;
    running = true;
    try {
      await runActorAlertsTick();
    } catch (e) {
      console.error("[alerts] actor_tick_failed", e);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), pollMs);
  console.log(`[alerts] actor worker pollMs=${pollMs}`);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
