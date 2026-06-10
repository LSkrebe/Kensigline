import { normalizeResearchPaperSourceKey } from "../shared/source-keys.js";
import { resolveDiscoverMentioned } from "./mentions.js";
import { truncateDiscoverSummary } from "./summary.js";
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

export function mapDocumentToDiscoverEvent(
  row: DocumentDiscoverRow,
  universe: Set<string>,
): DiscoverEvent {
  const ticker = String(row.ticker ?? "").trim().toUpperCase();
  const source = normalizeResearchPaperSourceKey(row.source_key);
  const title =
    String(row.title ?? "").trim() ||
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
    summary: truncateDiscoverSummary(row.analysis, 200),
    url: row.url,
    mentioned,
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
