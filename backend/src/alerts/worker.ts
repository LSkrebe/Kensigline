import { collectIdeaCandidates } from "./candidates.js";
import { sendIdeaDigestEmail } from "./email.js";
import { digestAlreadySent, listEnabledAlertUsers, logDigestSent, type AlertPreferences } from "./store.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function localHourInTimezone(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).formatToParts(date);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
    return Number.isFinite(h) ? h : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}

function localDateKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function shouldSendNow(prefs: AlertPreferences, now = new Date()): { send: boolean; slotKey: string | null } {
  const hour = localHourInTimezone(now, prefs.timezone);
  const dateKey = localDateKey(now, prefs.timezone);
  if (hour === prefs.morning_hour) return { send: true, slotKey: `${dateKey}-morning` };
  if (hour === prefs.evening_hour) return { send: true, slotKey: `${dateKey}-evening` };
  return { send: false, slotKey: null };
}

async function runDigestForUser(prefs: AlertPreferences, slotKey: string): Promise<void> {
  if (await digestAlreadySent(prefs.user_id, slotKey)) return;
  const items = await collectIdeaCandidates({
    sinceHours: 36,
    feeds: prefs.feeds,
    limit: prefs.max_items,
  });
  if (!items.length) {
    await logDigestSent(prefs.user_id, slotKey, 0);
    return;
  }
  const ok = await sendIdeaDigestEmail({
    to: prefs.email,
    subject: `Kensigline ideas (${items.length})`,
    items,
  });
  if (ok) {
    await logDigestSent(prefs.user_id, slotKey, items.length);
    console.log(`[alerts] digest sent user=${prefs.user_id} items=${items.length} slot=${slotKey}`);
  }
}

export function startAlertsWorker() {
  const pollMs = Math.max(60_000, Number(process.env.ALERTS_POLL_MS ?? 300_000));
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    if (String(process.env.ALERTS_ENABLED ?? "1").trim() === "0") return;
    running = true;
    try {
      const users = await listEnabledAlertUsers();
      const now = new Date();
      for (const prefs of users) {
        const { send, slotKey } = shouldSendNow(prefs, now);
        if (!send || !slotKey) continue;
        await runDigestForUser(prefs, slotKey);
      }
    } catch (e) {
      console.error("[alerts] tick_failed", e);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), pollMs);
  console.log(`[alerts] worker pollMs=${pollMs}`);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
