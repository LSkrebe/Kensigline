import { buildExploreRecapDayPayload } from "../explore/recap-day.js";
import { getCompanySnapshot } from "../core/company.js";

type RecapFiling = Record<string, unknown>;

export type PublicResearchEvent = {
  slug: string;
  dayKey: string;
  doc: string;
  side: string | null;
  ticker: string;
  companyName: string;
  actorName: string | null;
  actorMode: string | null;
  filingDate: string;
  headline: string;
  summary: string;
  context: string;
};

export type PublicResearchArchiveItem = {
  slug: string;
  dayKey: string;
  title: string;
  ticker: string;
  doc: string;
  filingDate: string;
};

function sideWord(side: unknown): string {
  if (side === "buy") return "purchase";
  if (side === "sell") return "sale";
  return "disclosure";
}

function scoreFiling(f: RecapFiling): number {
  let score = 0;
  const mode = String(f.actorMode ?? "");
  if (mode === "politicians") score += 100;
  else if (mode === "insider") score += 50;
  const amt = Number(f.amountUsd);
  if (Number.isFinite(amt) && amt > 0) score += Math.min(30, Math.log10(amt + 1) * 5);
  if (f.side === "buy") score += 5;
  return score;
}

function pickTopFiling(filings: RecapFiling[]): RecapFiling | null {
  if (!filings.length) return null;
  let best: RecapFiling | null = null;
  let bestScore = -1;
  for (const f of filings) {
    const s = scoreFiling(f);
    if (s > bestScore) {
      best = f;
      bestScore = s;
    }
  }
  return best;
}

function buildHeadline(f: RecapFiling): string {
  const ticker = String(f.ticker ?? "").toUpperCase();
  const company = String(f.companyName ?? ticker).trim();
  const actor = String(f.actorName ?? "").trim();
  const doc = String(f.doc ?? "Filing").trim();
  const side = sideWord(f.side);
  if (actor) return `${doc}: ${actor} reported a ${side} in ${company} (${ticker})`;
  return `${doc}: ${side} disclosure in ${company} (${ticker})`;
}

function buildSummary(f: RecapFiling): string {
  const ticker = String(f.ticker ?? "").toUpperCase();
  const company = String(f.companyName ?? ticker).trim();
  const actor = String(f.actorName ?? "").trim();
  const doc = String(f.doc ?? "disclosure").trim();
  const mode = String(f.actorMode ?? "");
  const filed = String(f.filingDate ?? "").trim();
  const role =
    mode === "politicians"
      ? "A member of Congress"
      : mode === "insider"
        ? "A company insider"
        : "A filer";
  const actorPhrase = actor ? `${role} (${actor})` : role;
  return `${actorPhrase} filed a ${doc} involving ${company} (${ticker})${filed ? ` on ${filed}` : ""}. The disclosure is public record — Mercerline surfaces it when it clears, before most headlines.`;
}

function buildContext(f: RecapFiling): string {
  const mode = String(f.actorMode ?? "");
  if (mode === "politicians") {
    return "Politician PTR disclosures are published after trades in individual stocks. The filing date is when the record becomes searchable — not when financial media picks up the story.";
  }
  if (mode === "insider") {
    return "Form 4 reports insider buys and sells. Executives and directors must file within a short window of the transaction. Same-day visibility matters because the market often reacts before the narrative catches up.";
  }
  return "US equity disclosures are public, but scattered across EDGAR and separate feeds. Mercerline assembles what cleared so you can open one workspace instead of five tabs.";
}

function toPublicEvent(f: RecapFiling): PublicResearchEvent | null {
  const filingDate = String(f.filingDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filingDate)) return null;
  return {
    slug: filingDate,
    dayKey: filingDate,
    doc: String(f.doc ?? "Filing"),
    side: f.side != null ? String(f.side) : null,
    ticker: String(f.ticker ?? "").toUpperCase(),
    companyName: String(f.companyName ?? f.ticker ?? "").trim(),
    actorName: f.actorName != null ? String(f.actorName).trim() : null,
    actorMode: f.actorMode != null ? String(f.actorMode) : null,
    filingDate,
    headline: buildHeadline(f),
    summary: buildSummary(f),
    context: buildContext(f),
  };
}

function groupFilingsByDay(filings: RecapFiling[]): Map<string, RecapFiling[]> {
  const map = new Map<string, RecapFiling[]>();
  for (const f of filings) {
    const day = String(f.filingDate ?? "").trim();
    if (!day) continue;
    const list = map.get(day) ?? [];
    list.push(f);
    map.set(day, list);
  }
  return map;
}

function buildArchive(byDay: Map<string, RecapFiling[]>, limit = 14): PublicResearchArchiveItem[] {
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limit)
    .map(([dayKey, rows]) => {
      const top = pickTopFiling(rows)!;
      return {
        slug: dayKey,
        dayKey,
        title: buildHeadline(top),
        ticker: String(top.ticker ?? "").toUpperCase(),
        doc: String(top.doc ?? "Filing"),
        filingDate: dayKey,
      };
    })
    .filter((x) => x.ticker);
}

export async function buildPublicResearchIndex(opts?: { lookbackDays?: number }) {
  const recap = await buildExploreRecapDayPayload({ lookbackDays: opts?.lookbackDays ?? 14 });
  const filings = (recap.filings ?? []) as RecapFiling[];
  const byDay = groupFilingsByDay(filings);
  const todayKey = recap.dayKey;
  const todayRows = byDay.get(todayKey) ?? filings.filter((f) => String(f.filingDate) === todayKey);
  const todayPick = pickTopFiling(todayRows);
  const archive = buildArchive(byDay);

  const latestDay = archive[0]?.dayKey ?? null;
  const latestRows = latestDay ? (byDay.get(latestDay) ?? []) : [];
  const latestPick = !todayPick && latestRows.length ? pickTopFiling(latestRows) : null;

  const today = todayPick ? toPublicEvent(todayPick) : null;
  const featured = latestPick ? toPublicEvent(latestPick) : null;

  return {
    ok: true,
    dayKey: todayKey,
    today,
    featured: today ? null : featured,
    archive,
  };
}

export async function buildPublicResearchEvent(dayKey: string, opts?: { lookbackDays?: number }) {
  const day = String(dayKey ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { ok: false as const, error: "invalid_day" };
  }
  const recap = await buildExploreRecapDayPayload({ lookbackDays: opts?.lookbackDays ?? 14 });
  const filings = (recap.filings ?? []) as RecapFiling[];
  const rows = filings.filter((f) => String(f.filingDate) === day);
  const pick = pickTopFiling(rows);
  if (!pick) return { ok: false as const, error: "not_found" };
  const event = toPublicEvent(pick);
  if (!event) return { ok: false as const, error: "not_found" };
  return { ok: true as const, event };
}

export async function buildPublicResearchTicker(tickerRaw: string, opts?: { lookbackDays?: number }) {
  const ticker = String(tickerRaw ?? "").trim().toUpperCase();
  if (!ticker) return { ok: false as const, error: "ticker_required" };

  const [snap, recap] = await Promise.all([
    getCompanySnapshot({ ticker }).catch(() => null),
    buildExploreRecapDayPayload({ lookbackDays: opts?.lookbackDays ?? 14 }),
  ]);

  const filings = (recap.filings ?? []) as RecapFiling[];
  const forTicker = filings.filter((f) => String(f.ticker ?? "").toUpperCase() === ticker);
  const latest = pickTopFiling(forTicker);

  return {
    ok: true,
    ticker,
    name: snap?.name ?? null,
    industry: snap?.industry ?? null,
    country: snap?.country ?? null,
    earnings_date: snap?.earnings_date ?? null,
    latest_close: snap?.latest_close ?? null,
    latestEvent: latest ? toPublicEvent(latest) : null,
  };
}
