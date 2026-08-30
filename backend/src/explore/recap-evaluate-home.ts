import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scopeRecapDayToDisplayDay } from "./recap-display-day.js";

type EvaluateExploreRecap = (day: Record<string, unknown>) => { slides: unknown[] };

let evaluateFn: EvaluateExploreRecap | null = null;
let evaluateLoadFailed = false;

async function loadEvaluateExploreRecap(): Promise<EvaluateExploreRecap | null> {
  if (evaluateLoadFailed) return null;
  if (evaluateFn) return evaluateFn;
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const modPath = path.resolve(here, "../../../frontend/src/exploreRecapEvaluate.js");
    const mod = (await import(pathToFileURL(modPath).href)) as { evaluateExploreRecap?: EvaluateExploreRecap };
    if (typeof mod.evaluateExploreRecap !== "function") {
      evaluateLoadFailed = true;
      return null;
    }
    evaluateFn = mod.evaluateExploreRecap;
    return evaluateFn;
  } catch (err) {
    evaluateLoadFailed = true;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[explore/recap-evaluate] load_failed", msg);
    return null;
  }
}

export type EvaluatedRecapHome = {
  slides: unknown[];
  displayDayKey: string;
  requestedDayKey: string;
  isFallback: boolean;
};

/** Evaluate recap slides server-side (same logic as Explore home). */
export async function evaluateRecapForHome(
  recap: Record<string, unknown>,
): Promise<EvaluatedRecapHome | null> {
  const evaluate = await loadEvaluateExploreRecap();
  if (!evaluate) return null;

  const scopedDay = scopeRecapDayToDisplayDay(recap);
  const earningsSoon = Array.isArray(recap.earningsSoon) ? recap.earningsSoon : [];
  const evaluated = evaluate({ ...scopedDay, earningsSoon });
  const slides = Array.isArray(evaluated?.slides) ? evaluated.slides : [];

  return {
    slides,
    displayDayKey: String(scopedDay.dayKey ?? ""),
    requestedDayKey: String(scopedDay.requestedDayKey ?? scopedDay.dayKey ?? ""),
    isFallback: scopedDay.isFallback === true,
  };
}
