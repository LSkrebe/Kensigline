import { currentMonthKey, loadMacroMonth, parseMonthKey } from "./macro.js";
import type { DiscoverMacroDay } from "./types.js";

type CacheEntry = { at: number; payload: MacroCalendarResult };

export type MacroCalendarResult = {
  ok: true;
  month: string;
  macro: DiscoverMacroDay[];
};

const cache = new Map<string, CacheEntry>();

export async function buildMacroCalendarCached(monthRaw?: string | null): Promise<MacroCalendarResult> {
  const parsed = parseMonthKey(monthRaw) ?? parseMonthKey(currentMonthKey());
  if (!parsed) {
    const month = currentMonthKey();
    const macro = await loadMacroMonth(
      Number(month.slice(0, 4)),
      Number(month.slice(5, 7)),
    );
    return { ok: true, month, macro };
  }

  const month = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
  const ttl = Math.max(5_000, Number(process.env.MACRO_CALENDAR_CACHE_MS ?? 45_000));
  const hit = cache.get(month);
  if (hit && Date.now() - hit.at < ttl) return hit.payload;

  const macro = await loadMacroMonth(parsed.year, parsed.month);
  const payload: MacroCalendarResult = { ok: true, month, macro };
  cache.set(month, { at: Date.now(), payload });
  return payload;
}
