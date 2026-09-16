export type MacroImpact = "high" | "medium" | "low";

export type DiscoverMacroEvent = {
  id: string;
  time: string;
  title: string;
  region: "US" | "EU" | "CN" | "UK";
  impact: MacroImpact;
};

export type DiscoverMacroDay = {
  date: string;
  events: DiscoverMacroEvent[];
};

/** Weekday templates (Mon=0 … Fri=4). Dates are generated from the real calendar. */
const MACRO_DAY_TEMPLATES: DiscoverMacroEvent[][] = [
  [
    { id: "mon-dallas", time: "10:30", title: "Dallas Fed manufacturing activity", region: "US", impact: "low" },
    { id: "mon-eu-sent", time: "10:00", title: "Eurozone economic sentiment", region: "EU", impact: "medium" },
  ],
  [
    { id: "tue-durables", time: "08:30", title: "Durable goods orders", region: "US", impact: "medium" },
    { id: "tue-eu-conf", time: "10:00", title: "Eurozone consumer confidence", region: "EU", impact: "low" },
  ],
  [
    { id: "wed-us-conf", time: "10:00", title: "US consumer confidence", region: "US", impact: "medium" },
    { id: "wed-waller", time: "14:00", title: "Fed Governor Waller - remarks", region: "US", impact: "medium" },
    { id: "wed-de-ifo", time: "04:00", title: "Germany Ifo business climate", region: "EU", impact: "low" },
  ],
  [
    { id: "thu-gdp", time: "08:30", title: "GDP - Q1 2nd estimate", region: "US", impact: "high" },
    { id: "thu-fomc-min", time: "14:00", title: "FOMC meeting minutes", region: "US", impact: "high" },
  ],
  [
    { id: "fri-claims", time: "08:30", title: "Initial jobless claims", region: "US", impact: "medium" },
    { id: "fri-pce", time: "08:30", title: "PCE price index", region: "US", impact: "high" },
    { id: "fri-ecb", time: "07:45", title: "ECB monetary policy account", region: "EU", impact: "medium" },
  ],
];

/** Next N business days from today (Mon–Fri only, today included). */
export function loadTemplateMacroDays(limit = 5): DiscoverMacroDay[] {
  const out: DiscoverMacroDay[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (!isWeekday(cursor)) {
    cursor.setDate(cursor.getDate() + 1);
  }

  while (out.length < limit) {
    if (isWeekday(cursor)) {
      const dow = cursor.getDay() - 1;
      const date = isoLocalDate(cursor);
      const templates = MACRO_DAY_TEMPLATES[dow] ?? MACRO_DAY_TEMPLATES[0] ?? [];
      out.push({
        date,
        events: templates.map((event, idx) => ({
          ...event,
          id: `${date}-${event.id ?? idx}`,
        })),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

function isoLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isWeekday(d: Date) {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

export function parseMonthKey(raw: string | null | undefined): { year: number; month: number } | null {
  const m = String(raw ?? "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function allDaysInMonth(year: number, month: number): string[] {
  const last = new Date(year, month, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(isoLocalDate(new Date(year, month - 1, d)));
  }
  return out;
}

export function loadTemplateMacroMonth(year: number, month: number): DiscoverMacroDay[] {
  return allDaysInMonth(year, month).map((date) => {
    const d = new Date(`${date}T12:00:00`);
    if (!isWeekday(d)) return { date, events: [] };
    const dow = d.getDay() - 1;
    const templates = MACRO_DAY_TEMPLATES[dow] ?? MACRO_DAY_TEMPLATES[0] ?? [];
    return {
      date,
      events: templates.map((event, idx) => ({
        ...event,
        id: `${date}-${event.id ?? idx}`,
      })),
    };
  });
}

/** Source-backed calendar only; propagate failures instead of inventing dates. */
export async function loadMacroMonth(year: number, month: number): Promise<DiscoverMacroDay[]> {
  const { loadLiveMacroMonth } = await import("./macro-live.js");
  return loadLiveMacroMonth(year, month);
}

/** Yahoo Finance economic calendar when reachable; otherwise weekday templates. */
export async function loadUpcomingMacroDays(limit = 5): Promise<DiscoverMacroDay[]> {
  try {
    const { loadLiveMacroDays } = await import("./macro-live.js");
    const live = await loadLiveMacroDays(limit);
    const hasEvents = live.some((day) => day.events.length > 0);
    if (hasEvents) return live;
  } catch (e) {
    console.warn("macro_live_fetch_failed", e);
  }
  return loadTemplateMacroDays(limit);
}
