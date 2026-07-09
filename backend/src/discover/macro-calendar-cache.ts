import { loadUpcomingMacroDays } from "./macro.js";
import type { DiscoverMacroDay } from "./types.js";

type CacheEntry = { at: number; payload: MacroCalendarResult };

export type MacroCalendarResult = {
  ok: true;
  days: number;
  macro: DiscoverMacroDay[];
};

const cache = new Map<number, CacheEntry>();

export async function buildMacroCalendarCached(days: number): Promise<MacroCalendarResult> {
  const ttl = Math.max(5_000, Number(process.env.MACRO_CALENDAR_CACHE_MS ?? 45_000));
  const hit = cache.get(days);
  if (hit && Date.now() - hit.at < ttl) return hit.payload;

  const macro = await loadUpcomingMacroDays(days);
  const payload: MacroCalendarResult = { ok: true, days, macro };
  cache.set(days, { at: Date.now(), payload });
  return payload;
}
