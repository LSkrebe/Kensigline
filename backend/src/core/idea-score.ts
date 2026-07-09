export type IdeaScoreResult = {
  idea_score: number;
  /** Strict “best of the best” flag used for UI highlighting + digests. */
  idea_best: boolean;
  idea_reasons: string[];
};

function envThreshold(key: string, fallback: number): number {
  const n = Number(process.env[key] ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function recencyBonus(eventAt: string | null | undefined): { pts: number; reason?: string } {
  const t = new Date(String(eventAt ?? "")).getTime();
  if (!Number.isFinite(t)) return { pts: 0 };
  const days = (Date.now() - t) / 86_400_000;
  if (days <= 2) return { pts: 18, reason: "Filed within the last 2 days" };
  if (days <= 7) return { pts: 12, reason: "Recent filing inside a week" };
  if (days <= 30) return { pts: 6, reason: "Activity inside 30 days" };
  return { pts: 0 };
}

function clampScore(score: number, reasons: string[], eventAt?: string | null): IdeaScoreResult {
  const best = envThreshold("IDEA_SCORE_BEST", 75);
  const idea_score = Math.max(0, Math.min(100, Math.round(score)));
  let idea_best = idea_score >= best;
  const decayDays = envThreshold("IDEA_BEST_DECAY_DAYS", 4);
  if (idea_best && eventAt) {
    const t = new Date(String(eventAt ?? "")).getTime();
    if (Number.isFinite(t)) {
      const ageDays = (Date.now() - t) / 86_400_000;
      if (ageDays > decayDays) idea_best = false;
    }
  }
  return {
    idea_score,
    idea_best,
    idea_reasons: reasons.filter(Boolean).slice(0, 6),
  };
}

/** Upcoming earnings row — scored for watchlist catalyst tier. */
export function scoreEarningsAheadEvent(earningsDate: string): IdeaScoreResult {
  const reasons: string[] = ["Upcoming earnings date"];
  let score = 58;
  const t = new Date(String(earningsDate ?? "")).getTime();
  if (Number.isFinite(t)) {
    const daysOut = (t - Date.now()) / 86_400_000;
    if (daysOut <= 7) {
      score += 36;
      reasons.push("Earnings within a week");
    } else if (daysOut <= 30) {
      score += 18;
      reasons.push("Earnings inside 30 days");
    }
  }
  return clampScore(score, reasons, earningsDate);
}

/** Green left-border highlight tier in Research / Investigate feeds (idea_best). */
export function isIdeaGreenHighlight(result: { idea_best?: boolean | null }): boolean {
  return Boolean(result.idea_best);
}

export type InvestigateRollupFeed = {
  feed_kind: string;
  idea_score: number;
  idea_reasons: string[];
  event_at: string | null;
};

export type InvestigateTickerRollup = IdeaScoreResult & {
  feed_kind: string | null;
  event_at: string | null;
};

function eventAgeDays(eventAt: string | null | undefined): number | null {
  const t = new Date(String(eventAt ?? "")).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

/** Ticker-level best signal across insider / politician / institution feeds (longer decay than row-level). */
export function computeInvestigateTickerRollup(feeds: InvestigateRollupFeed[]): InvestigateTickerRollup {
  const bestThreshold = envThreshold("IDEA_SCORE_BEST", 75);
  const rollupDecayDays = envThreshold("IDEA_ROLLUP_DECAY_DAYS", 14);

  let winner: InvestigateRollupFeed | null = null;
  for (const feed of feeds) {
    const score = Number(feed.idea_score) || 0;
    if (score <= 0) continue;
    const ageDays = eventAgeDays(feed.event_at);
    if (ageDays != null && ageDays > rollupDecayDays) continue;
    if (!winner) {
      winner = feed;
      continue;
    }
    const winnerScore = Number(winner.idea_score) || 0;
    if (score > winnerScore) {
      winner = feed;
      continue;
    }
    if (score < winnerScore) continue;
    const winnerAt = new Date(String(winner.event_at ?? "")).getTime();
    const feedAt = new Date(String(feed.event_at ?? "")).getTime();
    if (Number.isFinite(feedAt) && (!Number.isFinite(winnerAt) || feedAt > winnerAt)) {
      winner = feed;
    }
  }

  if (!winner) {
    return {
      idea_score: 0,
      idea_best: false,
      idea_reasons: [],
      feed_kind: null,
      event_at: null,
    };
  }

  const idea_score = Math.max(0, Math.min(100, Math.round(Number(winner.idea_score) || 0)));
  const ageDays = eventAgeDays(winner.event_at);
  const idea_best = idea_score >= bestThreshold && ageDays != null && ageDays <= rollupDecayDays;
  return {
    idea_score,
    idea_best,
    idea_reasons: Array.isArray(winner.idea_reasons) ? winner.idea_reasons.filter(Boolean).slice(0, 6) : [],
    feed_kind: String(winner.feed_kind ?? "").trim() || null,
    event_at: winner.event_at ?? null,
  };
}

/** Research feed: doc score for the latest row; rollup carries investigate best across tabs. */
export function mergeResearchFeedIdea(
  doc: IdeaScoreResult,
  rollup: IdeaScoreResult | null | undefined,
): IdeaScoreResult {
  if (!rollup || !(Number(rollup.idea_score) > 0)) return doc;
  const useRollupReasons = Boolean(rollup.idea_best) && Array.isArray(rollup.idea_reasons) && rollup.idea_reasons.length > 0;
  return {
    idea_score: Math.max(Number(doc.idea_score) || 0, Number(rollup.idea_score) || 0),
    idea_best: Boolean(doc.idea_best || rollup.idea_best),
    idea_reasons: useRollupReasons ? rollup.idea_reasons : doc.idea_reasons,
  };
}

export function investigateRollupFromSummary(
  raw: Record<string, unknown> | null | undefined,
): InvestigateTickerRollup | null {
  const rollup = raw?.investigate_rollup;
  if (!rollup || typeof rollup !== "object") return null;
  const r = rollup as Record<string, unknown>;
  const idea_score = Number(r.idea_score) || 0;
  if (idea_score <= 0) return null;
  return {
    idea_score,
    idea_best: Boolean(r.idea_best),
    idea_reasons: Array.isArray(r.idea_reasons) ? (r.idea_reasons as string[]) : [],
    feed_kind: r.feed_kind != null ? String(r.feed_kind) : null,
    event_at: r.event_at != null ? String(r.event_at) : null,
  };
}

export function scoreInsiderCluster(args: {
  data: any;
  eventAt?: string | null;
  todayCount?: number;
  totalUsd?: number;
}): IdeaScoreResult {
  const reasons: string[] = [];
  let score = 20;
  const rows = Array.isArray(args.data?.cluster?.worksheet_rows) ? args.data.cluster.worksheet_rows : [];
  const purchases = rows.filter(
    (r: any) => String(r?.transaction_code ?? "").toUpperCase() === "P" && String(r?.acquired_disposed ?? "A") === "A",
  );
  if (purchases.length) {
    score += 28;
    reasons.push(`${purchases.length} open-market purchase row${purchases.length === 1 ? "" : "s"}`);
  }
  const usd = Number(args.totalUsd ?? 0);
  if (usd >= 1_000_000) {
    score += 22;
    reasons.push("Purchase notional above $1M");
  } else if (usd >= 100_000) {
    score += 14;
    reasons.push("Meaningful purchase size");
  } else if (usd > 0) {
    score += 6;
  }
  const insiders = new Set(
    rows.map((r: any) => String(r?.insider_name ?? r?.key ?? "").trim()).filter(Boolean),
  );
  if (insiders.size >= 2) {
    score += 8;
    reasons.push("Multiple insiders active");
  }
  for (const r of rows) {
    const role = String(r?.role ?? r?.key ?? "").toUpperCase();
    if (/CEO|CFO|COO|CHIEF|DIRECTOR|OFFICER/.test(role)) {
      score += 10;
      reasons.push("Senior insider involved");
      break;
    }
  }
  if ((args.todayCount ?? 0) > 0) {
    score += 10;
    reasons.push("Events today on this ticker");
  }
  const rec = recencyBonus(args.eventAt);
  score += rec.pts;
  if (rec.reason) reasons.push(rec.reason);
  return clampScore(score, reasons, args.eventAt);
}

export function scorePoliticianCluster(args: {
  data: any;
  eventAt?: string | null;
  todayCount?: number;
  totalUsd?: number;
}): IdeaScoreResult {
  const reasons: string[] = [];
  let score = 18;
  const rows = Array.isArray(args.data?.cluster?.worksheet_rows) ? args.data.cluster.worksheet_rows : [];
  const purchases = rows.filter((r: any) => String(r?.transaction_type ?? "").toUpperCase() === "P");
  if (purchases.length) {
    score += 30;
    reasons.push(`${purchases.length} stock purchase disclosure${purchases.length === 1 ? "" : "s"}`);
  }
  const usd = Number(args.totalUsd ?? 0);
  if (usd >= 500_000) {
    score += 20;
    reasons.push("Disclosed amount above $500k midpoint");
  } else if (usd >= 50_000) {
    score += 12;
    reasons.push("Material disclosed range");
  }
  const chamber = String(args.data?.filing?.chamber ?? rows[0]?.chamber ?? "").toLowerCase();
  if (chamber === "senate") {
    score += 4;
    reasons.push("Senate PTR filing");
  }
  if ((args.todayCount ?? 0) > 0) {
    score += 8;
    reasons.push("PTR activity today");
  }
  const rec = recencyBonus(args.eventAt);
  score += rec.pts;
  if (rec.reason) reasons.push(rec.reason);
  return clampScore(score, reasons, args.eventAt);
}

export function scoreInstitutionCluster(args: {
  data: any;
  eventAt?: string | null;
  todayCount?: number;
  totalUsd?: number;
}): IdeaScoreResult {
  const reasons: string[] = [];
  let score = 16;
  const rows = Array.isArray(args.data?.cluster?.worksheet_rows) ? args.data.cluster.worksheet_rows : [];
  const activities = rows.map((r: any) => String(r?.activity ?? "").trim());
  if (activities.some((a: string) => a === "New position")) {
    score += 28;
    reasons.push("New 13F position");
  } else if (activities.some((a: string) => a === "Increased stake")) {
    score += 22;
    reasons.push("Increased institutional stake");
  } else if (activities.some((a: string) => a === "Reduced stake")) {
    score -= 8;
    reasons.push("Stake reduction flagged");
  }
  const usd = Number(args.totalUsd ?? 0);
  if (usd >= 50_000_000) {
    score += 18;
    reasons.push("Large disclosed holding value");
  } else if (usd >= 10_000_000) {
    score += 10;
    reasons.push("Meaningful position size");
  }
  const filers = new Set(rows.map((r: any) => String(r?.institution_name ?? r?.key ?? "").trim()).filter(Boolean));
  if (filers.size >= 2) {
    score += 8;
    reasons.push("Multiple institutions active");
  }
  if ((args.todayCount ?? 0) > 0) {
    score += 6;
    reasons.push("13F activity today");
  }
  const rec = recencyBonus(args.eventAt);
  score += rec.pts;
  if (rec.reason) reasons.push(rec.reason);
  return clampScore(score, reasons, args.eventAt);
}

export function scoreResearchDocument(args: {
  analysis?: string | null;
  source_key?: string | null;
  feed_kind?: string | null;
  program_phase?: string | null;
  event_at?: string | null;
  data?: any;
}): IdeaScoreResult {
  const reasons: string[] = [];
  let score = 22;
  const sk = String(args.source_key ?? "").toUpperCase();
  if (sk === "8-K") {
    score += 8;
    reasons.push("Material 8-K filing");
  }
  const rec = recencyBonus(args.event_at);
  score += rec.pts;
  if (rec.reason) reasons.push(rec.reason);
  return clampScore(score, reasons, args.event_at);
}
