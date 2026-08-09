import { runWithWorkerDb } from "../core/db.js";
import { collectDigestSections, digestItemCount } from "./digest-collect.js";
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
  const sections = await collectDigestSections({
    sinceHours: 36,
    feeds: prefs.feeds,
  });
  const itemCount = digestItemCount(sections);
  if (!itemCount) {
    await logDigestSent(prefs.user_id, slotKey, 0);
    return;
  }
  const slotLabel = slotKey.endsWith("-morning") ? "Morning" : slotKey.endsWith("-evening") ? "Evening" : undefined;
  const ok = await sendIdeaDigestEmail({
    to: prefs.email,
    subject: `Mercerline digest · ${itemCount} idea${itemCount === 1 ? "" : "s"}`,
    sections,
    ...(slotLabel ? { slotLabel } : {}),
  });
  if (ok) {
    await logDigestSent(prefs.user_id, slotKey, itemCount);
    console.log(`[alerts] digest sent user=${prefs.user_id} items=${itemCount} slot=${slotKey}`);
  }
}

export function startAlertsWorker() {
  const pollMs = Math.max(60_000, Number(process.env.ALERTS_DIGEST_POLL_MS ?? process.env.ALERTS_POLL_MS ?? 900_000));
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    if (String(process.env.ALERTS_ENABLED ?? "1").trim() === "0") return;
    running = true;
    try {
      await runWithWorkerDb(async () => {
        const users = await listEnabledAlertUsers();
        const now = new Date();
        for (const prefs of users) {
          const { send, slotKey } = shouldSendNow(prefs, now);
          if (!send || !slotKey) continue;
          await runDigestForUser(prefs, slotKey);
        }
      });
    } catch (e) {
      console.error("[alerts] tick_failed", e);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), pollMs);
  console.log(`[alerts] digest worker pollMs=${pollMs}`);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
