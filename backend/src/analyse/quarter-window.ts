/**
 * Calendar-anchored analyse grid: 6 historical quarters + 4 forward estimates.
 * Window rolls forward automatically as calendar time passes.
 */

import { quarterShortLabel, type FactRow } from "../core/xbrl-facts.js";
import type { QuarterlyPnlPoint } from "./quarterly-pnl.js";

export const HISTORICAL_QUARTERS = 6;
export const ESTIMATE_QUARTERS = 4;
export const TOTAL_COLUMNS = HISTORICAL_QUARTERS + ESTIMATE_QUARTERS;

export type CalendarQuarterSlot = {
  calYear: number;
  calQuarter: number;
  label: string;
  isEstimate: boolean;
  end: string;
};

export function calendarQuarterFromDate(date: Date): { calYear: number; calQuarter: number } {
  const calYear = date.getFullYear();
  const calQuarter = Math.floor(date.getMonth() / 3) + 1;
  return { calYear, calQuarter };
}

export function calendarQuarterFromEnd(end: string): { calYear: number; calQuarter: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
  const calYear = Number(end.slice(0, 4));
  const month = Number(end.slice(5, 7));
  if (!Number.isFinite(calYear) || !Number.isFinite(month)) return null;
  const calQuarter = Math.ceil(month / 3);
  if (calQuarter < 1 || calQuarter > 4) return null;
  return { calYear, calQuarter };
}

export function calendarQuarterEnd(calYear: number, calQuarter: number): string {
  const month = calQuarter * 3;
  const lastDay = [31, 30, 30, 31][calQuarter - 1]!;
  return `${calYear}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

export function advanceCalendarQuarter(
  calYear: number,
  calQuarter: number,
  steps: number,
): { calYear: number; calQuarter: number } {
  let y = calYear;
  let q = calQuarter;
  for (let i = 0; i < steps; i++) {
    q += 1;
    if (q > 4) {
      q = 1;
      y += 1;
    }
  }
  return { calYear: y, calQuarter: q };
}

export function retreatCalendarQuarter(
  calYear: number,
  calQuarter: number,
  steps: number,
): { calYear: number; calQuarter: number } {
  let y = calYear;
  let q = calQuarter;
  for (let i = 0; i < steps; i++) {
    q -= 1;
    if (q < 1) {
      q = 4;
      y -= 1;
    }
  }
  return { calYear: y, calQuarter: q };
}

export function labelForCalendarQuarter(
  calYear: number,
  calQuarter: number,
  estimate = false,
): string {
  return quarterShortLabel(
    {
      val: 0,
      end: calendarQuarterEnd(calYear, calQuarter),
      start: "",
      filed: "",
      fy: calYear,
      fp: `Q${calQuarter}`,
      form: estimate ? "10-Q" : "10-Q",
      frame: null,
    },
    estimate,
  );
}

/** Six reported quarters ending before the current calendar quarter, plus four forward. */
export function buildAnalyseQuarterWindow(asOf: Date = new Date()): CalendarQuarterSlot[] {
  const { calYear, calQuarter } = calendarQuarterFromDate(asOf);
  const lastHist = retreatCalendarQuarter(calYear, calQuarter, 1);

  const slots: CalendarQuarterSlot[] = [];
  let y = lastHist.calYear;
  let q = lastHist.calQuarter;

  for (let i = 0; i < HISTORICAL_QUARTERS; i++) {
    slots.push({
      calYear: y,
      calQuarter: q,
      label: labelForCalendarQuarter(y, q, false),
      isEstimate: false,
      end: calendarQuarterEnd(y, q),
    });
    const prev = retreatCalendarQuarter(y, q, 1);
    y = prev.calYear;
    q = prev.calQuarter;
  }
  slots.reverse();

  y = calYear;
  q = calQuarter;
  for (let i = 0; i < ESTIMATE_QUARTERS; i++) {
    slots.push({
      calYear: y,
      calQuarter: q,
      label: labelForCalendarQuarter(y, q, true),
      isEstimate: true,
      end: calendarQuarterEnd(y, q),
    });
    const next = advanceCalendarQuarter(y, q, 1);
    y = next.calYear;
    q = next.calQuarter;
  }

  return slots;
}

export function calendarQuarterKey(calYear: number, calQuarter: number): string {
  return `${calYear}:Q${calQuarter}`;
}

export function indexQuarterlyPointsByCalendar(
  points: QuarterlyPnlPoint[],
): Map<string, QuarterlyPnlPoint> {
  const map = new Map<string, QuarterlyPnlPoint>();
  for (const p of points) {
    const cal = calendarQuarterFromEnd(p.end);
    if (!cal) continue;
    const key = calendarQuarterKey(cal.calYear, cal.calQuarter);
    const cur = map.get(key);
    if (!cur || p.end > cur.end) map.set(key, p);
  }
  return map;
}

export function histPointsForWindow(
  window: CalendarQuarterSlot[],
  byCalendar: Map<string, QuarterlyPnlPoint>,
  sharesOutstanding: number | null,
): QuarterlyPnlPoint[] {
  return window
    .filter((s) => !s.isEstimate)
    .map((slot) => {
      const hit = byCalendar.get(calendarQuarterKey(slot.calYear, slot.calQuarter));
      if (hit) return { ...hit, label: slot.label };
      return {
        label: slot.label,
        end: slot.end,
        fy: slot.calYear,
        fp: `Q${slot.calQuarter}`,
        revenueUsd: null,
        grossProfitUsd: null,
        operatingExpensesUsd: null,
        operatingIncomeUsd: null,
        netIncomeUsd: null,
        shares: sharesOutstanding,
        cashUsd: null,
        debtUsd: null,
        fcfUsd: null,
      };
    });
}

export function pickProjectionAnchor(points: QuarterlyPnlPoint[]): QuarterlyPnlPoint | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]!;
    if (p.revenueUsd != null && p.revenueUsd > 0) return p;
  }
  return points[points.length - 1] ?? null;
}

export function factRowFromSlot(slot: CalendarQuarterSlot): FactRow {
  return {
    val: 0,
    end: slot.end,
    start: "",
    filed: "",
    fy: slot.calYear,
    fp: `Q${slot.calQuarter}`,
    form: "10-Q",
    frame: null,
  };
}
