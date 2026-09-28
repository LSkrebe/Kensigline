import { frontendOrigin } from "./config.js";
import { buildExploreRecapDayPayload } from "../explore/recap-day.js";
import { evaluateRecapForHome } from "../explore/recap-evaluate-home.js";
import { splitRecapSlidesForHome } from "../explore/recap-split-home.js";
import {
  catalogIdForFiler,
  EXPLORE_WATCHLIST_CATALOG,
  normalizeTrackedName,
} from "../explore/watchlist-catalog.js";
import { getCohortPerformance } from "../performance/cohort.js";

export type DigestSlide = {
  id: string;
  typeId: string;
  kicker: string;
  headline: string;
  summary: string;
  source: string;
  ticker: string;
  companyName: string | null;
  investorType: string | null;
  actionLabel: string | null;
  /** @deprecated Prefer weightChangeLabel for company row */
  moveLabel: string | null;
  moveUp: boolean;
  /** Portfolio weight change like holdings timeline: 1.2% → 3.4% */
  weightChangeLabel: string | null;
  /** Actor 1Y return chip, Explore tape style */
  perfLabel: string | null;
  perfTone: "up" | "down" | "flat" | null;
  sparklineUrl: string | null;
  actorSlug: string | null;
  portraitUrl: string | null;
  companyLogoUrl: string | null;
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

function companyLogoUrlFor(ticker: string | null | undefined): string | null {
  const t = String(ticker ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(t)) return null;
  return `${frontendOrigin()}/intro/company-logos/${encodeURIComponent(t)}.png`;
}

function catalogEntryForSlug(slug: string | null): (typeof EXPLORE_WATCHLIST_CATALOG)[number] | null {
  if (!slug) return null;
  const key = slug.toLowerCase();
  return (
    EXPLORE_WATCHLIST_CATALOG.find((entry) => entry.id === key || entry.slugs.some((s) => s.toLowerCase() === key)) ??
    null
  );
}

function investorTypeLabel(mode: string | null | undefined, source: string): string | null {
  const m = String(mode ?? "").toLowerCase();
  if (m === "politicians" || m === "politician") return "Politician";
  if (m === "insiders" || m === "insider") return "Insider";
  if (m === "institutions" || m === "institution") return "Institution";
  const s = String(source ?? "").toLowerCase();
  if (s.includes("ptr") || s.includes("politic")) return "Politician";
  if (s.includes("form") || s.includes("insider")) return "Insider";
  if (s.includes("13f") || s.includes("institut")) return "Institution";
  return null;
}

/** Short one-word action under the ticker. */
function actionLabelFromRaw(raw: Record<string, unknown>): string | null {
  const typeId = String(raw.typeId ?? "").toLowerCase();
  const headline = String(raw.headline ?? "").toLowerCase();
  const side = String(raw.side ?? "").toLowerCase();
  const activity = String(raw.activity ?? raw.docType ?? "").toLowerCase();
  const text = `${typeId} ${headline} ${activity}`;

  if (/new position|opened .+ position|open(ed)? position|\bnew\b/.test(headline) && /position|stake|13f/.test(text)) {
    return "New";
  }
  if (activity.includes("new position") || (typeId.includes("13f_add") && /new/.test(headline))) {
    return "New";
  }
  if (
    typeId.includes("13f_trim") ||
    /reduced stake|trimmed|decreas|reduc(ed|e)\b/.test(text) ||
    (typeId.includes("13f") && side === "sell")
  ) {
    return "Decrease";
  }
  if (
    typeId.includes("13f_add") ||
    /increased stake|added|increas/.test(text) ||
    (typeId.includes("13f") && side === "buy")
  ) {
    return "Increase";
  }
  if (typeId.includes("sale") || typeId.includes("sell") || side === "sell" || /\bsold\b|\bsale\b/.test(headline)) {
    return "Sell";
  }
  if (
    typeId.includes("purchase") ||
    typeId.includes("buy") ||
    side === "buy" ||
    /\bbought\b|\bpurchase\b/.test(headline)
  ) {
    return "Buy";
  }
  if (/trim|reduc|decreas/.test(headline)) return "Decrease";
  if (/increas|added/.test(headline)) return "Increase";
  if (/\bnew\b|opened/.test(headline)) return "New";
  return null;
}

async function mapDigestSlide(
  raw: Record<string, unknown>,
  cohortBySlug: Map<string, { returnFraction: number | null; investedUsd: number | null }>,
): Promise<DigestSlide> {
  const moveUp = raw.moveUp === true;

  const kicker = String(raw.kicker ?? raw.actorName ?? "Today");
  const rawSlug =
    (raw.actorSlug != null ? String(raw.actorSlug).trim().toLowerCase() : "") ||
    catalogSlugForName(kicker) ||
    catalogSlugForName(String(raw.actorName ?? "")) ||
    null;
  const actorSlug =
    catalogIdForFiler(rawSlug, kicker) ||
    catalogIdForFiler(rawSlug, String(raw.actorName ?? "")) ||
    catalogSlugForName(kicker) ||
    rawSlug;
  const catalog = catalogEntryForSlug(actorSlug) ?? catalogEntryForSlug(catalogSlugForName(kicker));
  const ticker = String(raw.ticker ?? "").trim().toUpperCase();
  const companyName =
    String(raw.companyName ?? raw.issuerName ?? raw.company ?? "").trim() || (ticker ? ticker : null);
  const source = String(raw.source ?? "");
  const cohort = actorSlug ? cohortBySlug.get(actorSlug) : undefined;
  const perf = formatPerfReturn(cohort?.returnFraction ?? null);
  const actionLabel = actionLabelFromRaw(raw);
  const amountUsd = Number(raw.amountUsd ?? raw.amount_usd);
  const weightChangeLabel =
    weightChangeFromRaw(raw) ||
    estimateWeightChange(actionLabel, amountUsd, cohort?.investedUsd ?? null);

  return {
    id: String(raw.id ?? ""),
    typeId: String(raw.typeId ?? ""),
    kicker: catalog?.name ?? kicker,
    headline: String(raw.headline ?? "").trim(),
    summary: String(raw.summary ?? "").trim(),
    source,
    ticker,
    companyName,
    investorType: investorTypeLabel(catalog?.mode ?? String(raw.actorMode ?? raw.mode ?? ""), source),
    actionLabel,
    moveLabel: raw.moveLabel != null ? String(raw.moveLabel) : null,
    moveUp,
    weightChangeLabel,
    perfLabel: perf?.label ?? null,
    perfTone: perf?.tone ?? null,
    sparklineUrl: null,
    actorSlug,
    portraitUrl: portraitUrlFor(actorSlug),
    companyLogoUrl: companyLogoUrlFor(ticker),
  };
}

function formatWeightPct(n: number): string {
  if (!Number.isFinite(n) || n < 0.05) return "0%";
  return `${n.toFixed(1)}%`;
}

/** Holdings-style stake change: 1.2% → 3.4% */
function weightChangeFromRaw(raw: Record<string, unknown>): string | null {
  const from = Number(raw.weightFrom ?? raw.fromWeight ?? raw.weight_from);
  const to = Number(raw.weightTo ?? raw.toWeight ?? raw.weight_to);
  if (Number.isFinite(from) && Number.isFinite(to)) {
    return `${formatWeightPct(from)} → ${formatWeightPct(to)}`;
  }
  const direct = String(raw.weightChangeLabel ?? "").trim();
  return direct || null;
}

/** Rough stake size from filing dollars vs known book when exact from/to missing. */
function estimateWeightChange(
  action: string | null,
  amountUsd: number,
  investedUsd: number | null,
): string | null {
  if (!(amountUsd > 0) || !(investedUsd != null && investedUsd > 0)) return null;
  const w = (amountUsd / investedUsd) * 100;
  if (!(w >= 0.05) || w > 100) return null;
  const slice = formatWeightPct(w);
  switch (action) {
    case "New":
    case "Buy":
      return `0% → ${slice}`;
    case "Sell":
      return `${slice} → 0%`;
    default:
      return null;
  }
}

function formatPerfReturn(fraction: number | null | undefined): {
  label: string;
  tone: "up" | "down" | "flat";
} | null {
  if (fraction == null || !Number.isFinite(fraction)) return null;
  const pct = fraction * 100;
  const abs = Math.abs(pct).toFixed(1);
  if (pct > 0.05) return { label: `+${abs}%`, tone: "up" };
  if (pct < -0.05) return { label: `−${abs}%`, tone: "down" };
  return { label: "0.0%", tone: "flat" };
}

async function loadCohortBySlug(): Promise<
  Map<string, { returnFraction: number | null; investedUsd: number | null }>
> {
  const map = new Map<string, { returnFraction: number | null; investedUsd: number | null }>();
  try {
    const snap = (await getCohortPerformance()) as {
      members?: Array<{
        slug?: string;
        returnFraction?: number | null;
        investedUsd?: number | null;
        returns?: Record<string, number>;
      }>;
    };
    for (const m of snap?.members ?? []) {
      const slug = String(m.slug ?? "")
        .trim()
        .toLowerCase();
      if (!slug) continue;
      const value = m.returns?.["1Y"] ?? m.returnFraction ?? null;
      const invested =
        typeof m.investedUsd === "number" && Number.isFinite(m.investedUsd) ? m.investedUsd : null;
      map.set(slug, {
        returnFraction: typeof value === "number" && Number.isFinite(value) ? value : null,
        investedUsd: invested,
      });
    }
  } catch (err) {
    console.warn("[digest] cohort_perf_failed", err instanceof Error ? err.message : err);
  }
  return map;
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

  const [recap, cohortBySlug] = await Promise.all([
    buildExploreRecapDayPayload({ lookbackDays: 7 }),
    loadCohortBySlug(),
  ]);
  const evaluated = await evaluateRecapForHome(recap as Record<string, unknown>);
  const allSlides = (evaluated?.slides ?? []) as Record<string, unknown>[];
  const split = await splitRecapSlidesForHome(allSlides, heroMax);

  const heroSlides = (
    await Promise.all(
      split.heroSlides
        .slice(0, heroMax)
        .map((s) => mapDigestSlide(s as Record<string, unknown>, cohortBySlug)),
    )
  ).filter(usableSlide);

  const heroIds = new Set(heroSlides.map((s) => s.id));
  const headlineSlides = (
    await Promise.all(
      split.storySlides
        .slice(0, headlineMax + heroMax)
        .map((s) => mapDigestSlide(s as Record<string, unknown>, cohortBySlug)),
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
