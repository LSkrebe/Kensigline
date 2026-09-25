import { frontendOrigin } from "./config.js";
import { sparklineSeriesParam } from "./digest-sparkline.js";
import { buildExploreRecapDayPayload } from "../explore/recap-day.js";
import { evaluateRecapForHome } from "../explore/recap-evaluate-home.js";
import { splitRecapSlidesForHome } from "../explore/recap-split-home.js";
import {
  EXPLORE_WATCHLIST_CATALOG,
  normalizeTrackedName,
} from "../explore/watchlist-catalog.js";

export type DigestSlide = {
  id: string;
  typeId: string;
  kicker: string;
  headline: string;
  summary: string;
  source: string;
  ticker: string;
  moveLabel: string | null;
  moveUp: boolean;
  sparklineUrl: string | null;
  actorSlug: string | null;
  portraitUrl: string | null;
};

export type DigestContent = {
  dayKey: string;
  displayDayKey: string;
  isFallback: boolean;
  heroSlides: DigestSlide[];
  headlineSlides: DigestSlide[];
  generatedAt: string;
};

function catalogSlugForName(raw: string | null | undefined): string | null {
  const key = normalizeTrackedName(raw);
  if (!key) return null;
  for (const entry of EXPLORE_WATCHLIST_CATALOG) {
    if (normalizeTrackedName(entry.name) === key) return entry.id;
    if (entry.matchNames.some((n) => normalizeTrackedName(n) === key)) return entry.id;
    const parts = normalizeTrackedName(entry.name).split(" ").filter(Boolean);
    if (parts.length >= 2 && parts.every((p) => key.includes(p))) return entry.id;
  }
  return null;
}

function portraitUrlFor(slug: string | null): string | null {
  if (!slug) return null;
  return `${frontendOrigin()}/investors/${encodeURIComponent(slug)}.webp`;
}

async function mapDigestSlide(raw: Record<string, unknown>): Promise<DigestSlide> {
  const priceSeries = Array.isArray(raw.priceSeries)
    ? raw.priceSeries.map((v) => Number(v)).filter((v) => Number.isFinite(v))
    : [];
  const moveUp = raw.moveUp === true;
  const sparklineUrl =
    priceSeries.length >= 2
      ? `${frontendOrigin()}/api/alerts/sparkline.png?d=${encodeURIComponent(sparklineSeriesParam(priceSeries))}`
      : null;

  const kicker = String(raw.kicker ?? raw.actorName ?? "Today");
  const actorSlug =
    (raw.actorSlug != null ? String(raw.actorSlug).trim().toLowerCase() : "") ||
    catalogSlugForName(kicker) ||
    catalogSlugForName(String(raw.actorName ?? "")) ||
    null;

  return {
    id: String(raw.id ?? ""),
    typeId: String(raw.typeId ?? ""),
    kicker,
    headline: String(raw.headline ?? "").trim(),
    summary: String(raw.summary ?? "").trim(),
    source: String(raw.source ?? ""),
    ticker: String(raw.ticker ?? "").trim().toUpperCase(),
    moveLabel: raw.moveLabel != null ? String(raw.moveLabel) : null,
    moveUp,
    sparklineUrl,
    actorSlug,
    portraitUrl: portraitUrlFor(actorSlug),
  };
}

function usableSlide(slide: DigestSlide): boolean {
  return Boolean(slide.headline || slide.summary);
}

export async function buildDigestContent(opts?: {
  heroMax?: number;
  headlineMax?: number;
}): Promise<DigestContent> {
  const heroMax = Math.max(1, Math.min(5, opts?.heroMax ?? 5));
  const headlineMax = Math.max(0, Math.min(8, opts?.headlineMax ?? 4));

  const recap = await buildExploreRecapDayPayload({ lookbackDays: 7 });
  const evaluated = await evaluateRecapForHome(recap as Record<string, unknown>);
  const allSlides = (evaluated?.slides ?? []) as Record<string, unknown>[];
  const split = await splitRecapSlidesForHome(allSlides, heroMax);

  const heroSlides = (
    await Promise.all(
      split.heroSlides
        .slice(0, heroMax)
        .map((s) => mapDigestSlide(s as Record<string, unknown>)),
    )
  ).filter(usableSlide);

  const heroIds = new Set(heroSlides.map((s) => s.id));
  const headlineSlides = (
    await Promise.all(
      split.storySlides
        .slice(0, headlineMax + heroMax)
        .map((s) => mapDigestSlide(s as Record<string, unknown>)),
    )
  )
    .filter((s) => usableSlide(s) && !heroIds.has(s.id))
    .slice(0, headlineMax);

  return {
    dayKey: String(recap.dayKey ?? ""),
    displayDayKey: evaluated?.displayDayKey ?? String(recap.dayKey ?? ""),
    isFallback: evaluated?.isFallback === true,
    heroSlides,
    headlineSlides,
    generatedAt: new Date().toISOString(),
  };
}

export function digestItemCount(content: DigestContent): number {
  return content.heroSlides.length + content.headlineSlides.length;
}

export function digestHasContent(content: DigestContent): boolean {
  // Skip quiet/fallback days — only send when there is real activity.
  if (content.isFallback) return false;
  return digestItemCount(content) > 0;
}
