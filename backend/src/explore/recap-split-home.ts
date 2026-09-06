import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type SplitRecapSlides = (
  slides: unknown[],
  heroMax?: number,
) => { heroSlides: unknown[]; storySlides: unknown[] };

let splitFn: SplitRecapSlides | null = null;
let splitLoadFailed = false;

async function loadSplitExploreRecapSlides(): Promise<SplitRecapSlides | null> {
  if (splitLoadFailed) return null;
  if (splitFn) return splitFn;
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const modPath = path.resolve(here, "../../../frontend/src/exploreRecapHero.js");
    const mod = (await import(pathToFileURL(modPath).href)) as { splitExploreRecapSlides?: SplitRecapSlides };
    if (typeof mod.splitExploreRecapSlides !== "function") {
      splitLoadFailed = true;
      return null;
    }
    splitFn = mod.splitExploreRecapSlides;
    return splitFn;
  } catch (err) {
    splitLoadFailed = true;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[explore/recap-split] load_failed", msg);
    return null;
  }
}

export async function splitRecapSlidesForHome(
  slides: unknown[],
  heroMax = 5,
): Promise<{ heroSlides: unknown[]; storySlides: unknown[] }> {
  const split = await loadSplitExploreRecapSlides();
  if (!split) {
    const list = Array.isArray(slides) ? slides.filter(Boolean) : [];
    const cap = Math.max(1, Math.min(list.length, heroMax));
    return { heroSlides: list.slice(0, cap), storySlides: list.slice(cap) };
  }
  return split(slides, heroMax);
}
