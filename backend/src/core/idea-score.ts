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

function clampScore(score: number, reasons: string[]): IdeaScoreResult {
  const best = envThreshold("IDEA_SCORE_BEST", 90);
  const idea_score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    idea_score,
    idea_best: idea_score >= best,
    idea_reasons: reasons.filter(Boolean).slice(0, 6),
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
  return clampScore(score, reasons);
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
  return clampScore(score, reasons);
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
  return clampScore(score, reasons);
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
  const phase = String(args.program_phase ?? args.data?.phase ?? "").toUpperCase();
  if (phase.includes("III") || phase === "3") {
    score += 28;
    reasons.push("Phase III program signal");
  } else if (phase.includes("II") || phase === "2") {
    score += 18;
    reasons.push("Phase II program signal");
  } else if (phase.includes("I") || phase === "1") {
    score += 10;
    reasons.push("Early-phase program signal");
  }
  const sk = String(args.source_key ?? "").toUpperCase();
  if (sk.includes("CLINICAL") || sk.includes("TRIAL")) {
    score += 12;
    reasons.push("Clinical registry update");
  } else if (sk === "8-K") {
    score += 8;
    reasons.push("Material 8-K filing");
  }
  const et = String(args.data?.event_type ?? "").toUpperCase();
  if (et === "RESULT" || et === "REGULATORY") {
    score += 16;
    reasons.push(`${et === "RESULT" ? "Trial result" : "Regulatory"} event`);
  }
  if (args.feed_kind === "pharma") score += 6;
  const text = String(args.analysis ?? "").toLowerCase();
  if (/readout|endpoint|approval|enrollment|pivotal|topline|fda/.test(text)) {
    score += 10;
    reasons.push("High-signal clinical language");
  }
  const rec = recencyBonus(args.event_at);
  score += rec.pts;
  if (rec.reason) reasons.push(rec.reason);
  return clampScore(score, reasons);
}
