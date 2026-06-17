import { normalizeResearchPaperSourceKey } from "../shared/source-keys.js";
import {
  isIdeaGreenHighlight,
  scoreInsiderCluster,
  scoreInstitutionCluster,
  scorePoliticianCluster,
  scoreResearchDocument,
} from "../core/idea-score.js";
import { flowEventTitleFromRow, flowSummaryFromRow } from "./flow-copy.js";
import { resolveDiscoverMentioned } from "./mentions.js";
import type { DiscoverEvent, DiscoverEventKind, DiscoverIntelMode } from "./types.js";

const FLOW_SOURCES = new Set(["Form 4", "Form 3", "Form 5", "13F", "PTR"]);

export function inferIntelMode(feedKind: string | null, industry: string | null): DiscoverIntelMode {
  if (String(feedKind ?? "").toLowerCase() === "pharma") return "clinical";
  const ind = String(industry ?? "").toLowerCase();
  if (
    ind.includes("biotech") ||
    ind.includes("biopharm") ||
    ind.includes("pharma") ||
    ind.includes("drug") ||
    ind.includes("life science")
  ) {
    return "clinical";
  }
  return "market";
}

export function inferEventKind(sourceKey: string, title: string, feedKind: string | null): DiscoverEventKind {
  const src = normalizeResearchPaperSourceKey(sourceKey);
  const t = String(title ?? "").toLowerCase();

  if (FLOW_SOURCES.has(src)) return "flow";
  if (src === "ClinicalTrials.gov") return "trial";
  if (src === "Earnings transcript" || /\bearnings\b/i.test(t)) return "earnings";
  if (/\bpdufa\b|\bfda\b|\bregulatory\b|\bapproval\b/i.test(t)) return "regulatory";
  if (/\btopline\b|\breadout\b|\binterim\b|\bcatalyst\b|\bcompletion\b/i.test(t)) return "catalyst";
  if (String(feedKind ?? "").toLowerCase() === "pharma" && /\btrial\b|\bphase\b|\benroll/i.test(t)) return "trial";
  return "filing";
}

export function isoDayStart(at: string): string {
  const raw = String(at ?? "").trim();
  if (!raw) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T12:00:00.000Z`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toISOString();
}

export type DocumentDiscoverRow = {
  id: string;
  ticker: string;
  company_name: string | null;
  event_at: string;
  title: string | null;
  source_key: string | null;
  feed_kind: string | null;
  analysis: string | null;
  url: string | null;
  program_drug: string | null;
  program_phase: string | null;
  industry: string | null;
  data: unknown;
};

function clusterTotalUsd(data: unknown): number {
  const rows = Array.isArray((data as any)?.cluster?.worksheet_rows) ? (data as any).cluster.worksheet_rows : [];
  return rows.reduce((sum: number, r: any) => {
    const amt = Number(r?.amount_usd ?? r?.amount_usd_mid ?? r?.value_usd ?? 0);
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);
}

/** Investigate FEED dollar+count labels (e.g. "$175K (1)" or "175001 (1)") — not card copy. */
export function isAmountFeedLabel(text: string | null | undefined): boolean {
  const s = String(text ?? "").trim();
  if (!s) return false;
  if (/^\$?[\d.,]+[KMB]?\s*\(\d+\)$/i.test(s)) return true;
  if (/^\d{3,}\s*\(\d+\)$/.test(s)) return true;
  return false;
}

export function flowEventTitle(row: DocumentDiscoverRow): string {
  return flowEventTitleFromRow(row);
}

export function discoverSummaryText(row: DocumentDiscoverRow): string | null {
  return flowSummaryFromRow(row);
}

function scoreDiscoverDocumentRow(row: DocumentDiscoverRow, opts?: { todayCount?: number }) {
  const fk = String(row.feed_kind ?? "").toLowerCase();
  const data = row.data;
  const todayCount = opts?.todayCount ?? 0;
  if (fk === "insider") {
    return scoreInsiderCluster({
      data,
      eventAt: row.event_at,
      totalUsd: clusterTotalUsd(data),
      todayCount,
    });
  }
  if (fk === "politicians") {
    return scorePoliticianCluster({
      data,
      eventAt: row.event_at,
      totalUsd: clusterTotalUsd(data),
      todayCount,
    });
  }
  if (fk === "institutions") {
    return scoreInstitutionCluster({
      data,
      eventAt: row.event_at,
      totalUsd: clusterTotalUsd(data),
      todayCount,
    });
  }
  return scoreResearchDocument({
    analysis: row.analysis,
    source_key: row.source_key,
    feed_kind: row.feed_kind,
    program_phase: row.program_phase,
    event_at: row.event_at,
    data,
  });
}

/** Same green-highlight tier as Investigate / Research feed rows. */
export function discoverEventIsMarketMove(event: DiscoverEvent): boolean {
  if (!isIdeaGreenHighlight(event)) return false;
  if (String(event.summary ?? "").trim()) return true;
  if (event.kind === "flow" && String(event.title ?? "").trim()) return true;
  return false;
}

export function mapDocumentToDiscoverEvent(
  row: DocumentDiscoverRow,
  universe: Set<string>,
  opts?: { todayCount?: number },
): DiscoverEvent {
  const ticker = String(row.ticker ?? "").trim().toUpperCase();
  const source = normalizeResearchPaperSourceKey(row.source_key);
  const fk = String(row.feed_kind ?? "").toLowerCase();
  const isFlow = fk === "insider" || fk === "politicians" || fk === "institutions";
  const title = isFlow
    ? flowEventTitle(row)
    : String(row.title ?? "").trim() ||
      String(row.source_key ?? "").trim() ||
      "Document update";
  const intelMode = inferIntelMode(row.feed_kind, row.industry);
  const kind = inferEventKind(source, title, row.feed_kind);
  const mentioned = resolveDiscoverMentioned({
    ticker,
    analysis: row.analysis,
    data: row.data,
    universe,
  });
  const idea = scoreDiscoverDocumentRow(row, opts);

  return {
    id: `doc:${row.id}`,
    ticker,
    companyName: String(row.company_name ?? ticker).trim() || ticker,
    intelMode,
    at: isoDayStart(row.event_at),
    title,
    kind,
    source,
    phase: row.program_phase,
    programKey: row.program_drug,
    summary: discoverSummaryText(row),
    url: row.url,
    mentioned,
    idea_score: idea.idea_score,
    idea_best: idea.idea_best,
    idea_reasons: idea.idea_reasons,
  };
}

export function mapEarningsAheadEvent(args: {
  ticker: string;
  companyName: string;
  earningsDate: string;
  intelMode: DiscoverIntelMode;
}): DiscoverEvent {
  return {
    id: `earn:${args.ticker}:${args.earningsDate.slice(0, 10)}`,
    ticker: args.ticker,
    companyName: args.companyName,
    intelMode: args.intelMode,
    at: isoDayStart(args.earningsDate),
    title: "Earnings report",
    kind: "earnings",
    source: "8-K",
    programKey: "Earnings",
    impact: "medium",
  };
}

export function mapCatalystAheadEvent(args: {
  ticker: string;
  companyName: string;
  id: string;
  label: string;
  at: string;
  phase: string | null;
  programKey: string;
  url: string | null;
  kind: "trial" | "earnings";
}): DiscoverEvent | null {
  if (!args.at) return null;
  const labelLo = args.label.toLowerCase();
  let kind: DiscoverEventKind = "trial";
  if (args.kind === "earnings") kind = "earnings";
  else if (labelLo.includes("primary completion") || labelLo.includes("readout") || labelLo.includes("interim")) {
    kind = "catalyst";
  }

  return {
    id: `cat:${args.ticker}:${args.id}`,
    ticker: args.ticker,
    companyName: args.companyName,
    intelMode: "clinical",
    at: isoDayStart(args.at),
    title: args.label,
    kind,
    source: "ClinicalTrials.gov",
    phase: args.phase,
    programKey: args.programKey,
    url: args.url,
    impact: kind === "catalyst" ? "high" : "medium",
  };
}

export function eventPassesSourceFilter(event: DiscoverEvent, enabled: Set<string> | null): boolean {
  if (enabled === null) return true;
  if (!enabled.size) return false;
  return enabled.has(normalizeResearchPaperSourceKey(event.source));
}

export function eventMatchesQuery(
  event: DiscoverEvent,
  q: string,
  mentionedHay: string,
): boolean {
  const needle = String(q ?? "").trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    event.ticker,
    event.companyName,
    event.title,
    event.programKey ?? "",
    event.source ?? "",
    event.summary ?? "",
    mentionedHay,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}
