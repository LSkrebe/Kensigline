/** Calendar-day helpers for Europe/Vilnius (idempotent daily reports). */

const VILNIUS = "Europe/Vilnius";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatYmdInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** UTC instant for a wall-clock time in `timeZone` on calendar day `ymd` (YYYY-MM-DD). */
export function utcInstantForZonedWallTime(
  ymd: string,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`invalid_ymd:${ymd}`);
  const targetAsUtc = Date.UTC(y, m - 1, d, hour, minute, second);
  let guess = new Date(targetAsUtc);

  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(guess);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    guess = new Date(guess.getTime() + (targetAsUtc - asUtc));
  }
  return guess;
}

function addCalendarDays(ymd: string, delta: number): string {
  const parts = ymd.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Previous calendar day in Europe/Vilnius: [start, end). */
export function previousVilniusDayWindow(now = new Date()): {
  start: Date;
  end: Date;
  label: string;
  timeZone: string;
} {
  const today = formatYmdInTimeZone(now, VILNIUS);
  const label = addCalendarDays(today, -1);
  const start = utcInstantForZonedWallTime(label, 0, 0, 0, VILNIUS);
  const end = utcInstantForZonedWallTime(today, 0, 0, 0, VILNIUS);
  return { start, end, label, timeZone: VILNIUS };
}
