import { currentMonthKey, loadMacroMonth, parseMonthKey } from "./macro.js";
import { getMarketHolidaysForMonth, type MarketHoliday } from "./market-holidays.js";
import type { DiscoverMacroDay } from "./types.js";

type CacheEntry = { at: number; payload: MacroCalendarResult };

export type MacroCalendarResult = {
  ok: true;
  month: string;
  macro: DiscoverMacroDay[];
  market_holidays: MarketHoliday[];
};

const cache = new Map<string, CacheEntry>();

export async function buildMacroCalendarCached(monthRaw?: string | null): Promise<MacroCalendarResult> {
  const parsed = parseMonthKey(monthRaw) ?? parseMonthKey(currentMonthKey());
  if (!parsed) {
    const month = currentMonthKey();
    const year = Number(month.slice(0, 4));
    const mon = Number(month.slice(5, 7));
    const [macro, market_holidays] = await Promise.all([
      loadMacroMonth(year, mon),
      getMarketHolidaysForMonth(year, mon),
    ]);
    return { ok: true, month, macro, market_holidays };
  }

  const month = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
  const ttl = Math.max(5_000, Number(process.env.MACRO_CALENDAR_CACHE_MS ?? 45_000));
  const hit = cache.get(month);
  if (hit && Date.now() - hit.at < ttl) return hit.payload;

  const [macro, market_holidays] = await Promise.all([
    loadMacroMonth(parsed.year, parsed.month),
    getMarketHolidaysForMonth(parsed.year, parsed.month),
  ]);
  const payload: MacroCalendarResult = { ok: true, month, macro, market_holidays };
  cache.set(month, { at: Date.now(), payload });
  return payload;
}
