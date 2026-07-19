import { formatUsdCompact } from "../shared/money.js";
import { normalizeResearchPaperSourceKey } from "../shared/source-keys.js";
import { truncateDiscoverSummary } from "./summary.js";
import type { DocumentDiscoverRow } from "./map.js";

function isFlowFeedKind(feedKind: string | null | undefined) {
  const fk = String(feedKind ?? "").toLowerCase();
  return fk === "insider" || fk === "politicians" || fk === "institutions";
}

/** Investigate FEED dollar+count labels (e.g. "$175K (1)" or "175001 (1)") — not card copy. */
function isAmountFeedLabel(text: string | null | undefined): boolean {
  const s = String(text ?? "").trim();
  if (!s) return false;
  if (/^\$?[\d.,]+[KMB]?\s*\(\d+\)$/i.test(s)) return true;
  if (/^\d{3,}\s*\(\d+\)$/.test(s)) return true;
  return false;
}

function worksheetRows(data: unknown): any[] {
  const parsed = normalizeDocData(data);
  const rows = parsed?.cluster?.worksheet_rows;
  return Array.isArray(rows) ? rows : [];
}

function normalizeDocData(data: unknown): any {
  if (!data) return null;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}

/** Dollar+count labels from Investigate feed (e.g. "175001 (1)" or "$175K (2)"). */
function parseAmountFeedLabel(label: string | null | undefined): { mid: number; count: number } | null {
  const s = String(label ?? "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{3,})\s*\((\d+)\)$/);
  if (m) return { mid: Number(m[1]), count: Number(m[2]) };

  m = s.match(/^\$?([\d.,]+)\s*([KMB])?\s*\((\d+)\)$/i);
  if (m) {
    let n = Number(String(m[1]).replace(/,/g, ""));
    const suffix = String(m[2] ?? "").toUpperCase();
    if (suffix === "K") n *= 1_000;
    else if (suffix === "M") n *= 1_000_000;
    else if (suffix === "B") n *= 1_000_000_000;
    if (Number.isFinite(n) && Number.isFinite(Number(m[3]))) {
      return { mid: n, count: Number(m[3]) };
    }
  }

  m = s.match(/^\((\d+)\)$/);
  if (m) return { mid: 0, count: Number(m[1]) };

  return null;
}

function clusterFeedLabel(data: unknown): string {
  const parsed = normalizeDocData(data);
  return String(parsed?.cluster?.feed_label ?? "").trim();
}

function chamberHonorific(chamber: string | null | undefined): string {
  const c = String(chamber ?? "").trim().toLowerCase();
  if (c === "senate") return "Senator";
  if (c === "house") return "Representative";
  if (c === "executive") return "Executive";
  return "Member";
}

function buildInsiderFlowCopy(row: DocumentDiscoverRow): { title: string; summary: string } | null {
  const data = normalizeDocData(row.data) as {
    issuer?: { name?: string | null };
    filing?: { form_type?: string | null };
    cluster?: { insiders?: string[]; feed_label?: string | null };
  } | null;
  const rows = worksheetRows(data);
  const cluster = data?.cluster ?? {};
  const parsed = parseAmountFeedLabel(cluster.feed_label);

  const purchases = rows.filter(
    (r) =>
      String(r?.transaction_code ?? "").toUpperCase() === "P" &&
      String(r?.acquired_disposed ?? "A").toUpperCase() === "A",
  );
  const focus = purchases.length ? purchases : rows;
  const totalShares = focus.reduce((sum, r) => sum + (Number(r?.shares) || 0), 0);
  const totalUsd =
    focus.length > 0
      ? focus.reduce((sum, r) => sum + (Number(r?.amount_usd) || 0), 0)
      : Number(parsed?.mid ?? 0);
  const lead = focus[0] ?? rows[0];
  const insiderName = String(lead?.insider_name ?? cluster.insiders?.[0] ?? "").trim();
  const role = String(lead?.role ?? "").trim();
  const keyName = String(lead?.key ?? "").trim();
  const who = insiderName || (keyName && keyName !== "Insider" ? keyName : "");
  const whoLabel = role && who ? `${role} ${who}` : who || role || "an insider";

  const n = focus.length || parsed?.count || (who ? 1 : 0);
  if (!n) return null;
  const formType = String(data?.filing?.form_type ?? row.source_key ?? "Form 4").trim();

  let title: string;
  if (purchases.length && totalShares > 0) {
    title = `${n} Code P purchase${n === 1 ? "" : "s"} totaling ${totalShares.toLocaleString("en-US")} shares`;
  } else if (totalUsd > 0) {
    title = `${n} insider transaction${n === 1 ? "" : "s"} (~${formatUsdCompact(totalUsd)})`;
  } else {
    title = `${n} ${formType} transaction${n === 1 ? "" : "s"}`;
  }

  const issuer = String(data?.issuer?.name ?? row.company_name ?? row.ticker ?? "").trim();
  let summary = `This ${formType} filing`;
  if (purchases.length || !rows.length) {
    summary += ` includes ${n} Code P open-market purchase${n === 1 ? "" : "s"} by ${whoLabel}`;
    if (totalShares > 0) summary += `, acquiring ${totalShares.toLocaleString("en-US")} shares`;
    if (totalUsd > 0) summary += ` at ~${formatUsdCompact(totalUsd)} notional`;
  } else {
    summary += ` reports activity by ${whoLabel}`;
    if (totalUsd > 0) summary += ` (~${formatUsdCompact(totalUsd)})`;
  }
  if (issuer) summary += ` in ${issuer}`;
  summary += ".";

  return { title, summary };
}

function buildPoliticianFlowCopy(row: DocumentDiscoverRow): { title: string; summary: string } | null {
  const data = normalizeDocData(row.data) as {
    cluster?: { politicians?: string[]; feed_label?: string | null };
    filing?: { chamber?: string | null };
    issuer?: { name?: string | null };
  } | null;
  const rows = worksheetRows(data);
  const cluster = data?.cluster ?? {};
  const filing = data?.filing ?? {};
  const parsed = parseAmountFeedLabel(cluster.feed_label);

  const purchases = rows.filter((r) => String(r?.transaction_type ?? "").toUpperCase() === "P");
  const focus = purchases.length ? purchases : rows;
  const filer = String(
    focus[0]?.key ?? cluster.politicians?.[0] ?? rows[0]?.key ?? "",
  ).trim();
  const chamber = String(focus[0]?.chamber ?? filing.chamber ?? "").trim();
  const honorific = chamberHonorific(chamber);
  const sumMid =
    focus.length > 0
      ? focus.reduce((sum, r) => sum + (Number(r?.amount_usd_mid ?? r?.amount_usd ?? 0) || 0), 0)
      : Number(parsed?.mid ?? 0);
  const n = focus.length || parsed?.count || (filer ? 1 : 0);
  if (!n) return null;
  const amt = sumMid > 0 ? formatUsdCompact(sumMid) : null;
  const asset = String(focus[0]?.asset_name ?? "").trim();
  const ticker = String(row.ticker ?? "").trim().toUpperCase();

  const title = purchases.length || !rows.length
    ? `${n} stock purchase${n === 1 ? "" : "s"}${amt ? ` (~${amt} midpoint)` : ""}`
    : `${n} PTR disclosure${n === 1 ? "" : "s"}${amt ? ` (~${amt})` : ""}`;

  let summary = `PTR disclosure for ${ticker}`;
  if (filer) summary += `: ${honorific} ${filer}`;
  else if (chamber) summary += `: ${honorific}`;
  summary += ` reported ${n} stock purchase${n === 1 ? "" : "s"}`;
  if (amt) summary += ` at a disclosed midpoint of ${amt}`;
  if (asset && asset.toUpperCase() !== ticker) summary += ` in ${asset}`;
  summary += ".";

  return { title, summary };
}

function buildInstitutionFlowCopy(row: DocumentDiscoverRow): { title: string; summary: string } | null {
  const data = normalizeDocData(row.data) as {
    cluster?: { institutions?: string[]; feed_label?: string | null };
  } | null;
  const rows = worksheetRows(data);
  const cluster = data?.cluster ?? {};
  const parsed = parseAmountFeedLabel(cluster.feed_label);

  const lead = rows[0];
  const activity = String(lead?.activity ?? "position change").trim();
  const institution = String(
    lead?.institution_name ?? lead?.key ?? cluster.institutions?.[0] ?? "",
  ).trim();
  const value =
    rows.length > 0
      ? rows.reduce((sum, r) => sum + (Number(r?.amount_usd ?? 0) || 0), 0)
      : Number(parsed?.mid ?? 0);
  const shares = Number(lead?.shares ?? 0);
  const ticker = String(row.ticker ?? "").trim().toUpperCase();
  const n = rows.length || parsed?.count || 0;
  if (!institution && !n) return null;

  const title = institution
    ? `${activity} · ${institution}`
    : `${n} 13F holding update${n === 1 ? "" : "s"}${value > 0 ? ` (~${formatUsdCompact(value)})` : ""}`;
  let summary = institution
    ? `13F filing shows ${institution} with ${activity.toLowerCase()} in ${ticker}`
    : `13F filing reports ${n} position update${n === 1 ? "" : "s"} in ${ticker}`;
  if (value > 0) summary += `, disclosed value ~${formatUsdCompact(value)}`;
  if (Number.isFinite(shares) && shares > 0) {
    summary += ` (${shares.toLocaleString("en-US")} shares)`;
  }
  summary += ".";

  return { title, summary };
}

/** Template headlines + body copy for flow market-move cards (no LLM). */
export function buildFlowMarketMoveCopy(row: DocumentDiscoverRow): { title: string; summary: string } | null {
  const fk = String(row.feed_kind ?? "").toLowerCase();
  if (fk === "insider") return buildInsiderFlowCopy(row);
  if (fk === "politicians") return buildPoliticianFlowCopy(row);
  if (fk === "institutions") return buildInstitutionFlowCopy(row);
  return null;
}

export function flowEventTitleFromRow(row: DocumentDiscoverRow): string {
  const data = normalizeDocData(row.data);
  const clusterLabel = clusterFeedLabel(data);
  if (clusterLabel && !isAmountFeedLabel(clusterLabel)) return clusterLabel;

  const templated = buildFlowMarketMoveCopy(row);
  if (templated?.title) return templated.title;

  const sk = normalizeResearchPaperSourceKey(row.source_key);
  const company = String(row.company_name ?? row.ticker ?? "").trim();
  if (sk === "Form 4" || sk === "Form 3" || sk === "Form 5") {
    return company ? `Insider activity · ${company}` : "Insider Form 4 activity";
  }
  if (sk === "PTR") return company ? `Politician disclosure · ${company}` : "Politician PTR disclosure";
  if (sk === "13F") return company ? `Institutional 13F · ${company}` : "Institutional 13F filing";
  return sk || "Flow activity";
}

export function flowSummaryFromRow(row: DocumentDiscoverRow): string | null {
  const analysis = String(row.analysis ?? "").trim();
  if (analysis) return truncateDiscoverSummary(analysis, 200);

  const data = normalizeDocData(row.data);
  const sentences = data?.cluster?.context_sentences;
  if (Array.isArray(sentences) && sentences.length) {
    const joined = sentences
      .map((s) => String(s ?? "").trim())
      .filter(Boolean)
      .join(" ");
    if (joined) return truncateDiscoverSummary(joined, 200);
  }

  const clusterLabel = clusterFeedLabel(data);
  if (clusterLabel && !isAmountFeedLabel(clusterLabel)) {
    return truncateDiscoverSummary(clusterLabel, 200);
  }

  const templated = buildFlowMarketMoveCopy(row);
  if (templated?.summary) return truncateDiscoverSummary(templated.summary, 200);

  if (isFlowFeedKind(row.feed_kind)) {
    const issuer = String(
      (row.data as { issuer?: { name?: string | null } } | null)?.issuer?.name ??
        row.company_name ??
        "",
    ).trim();
    const sk = normalizeResearchPaperSourceKey(row.source_key);
    if (issuer) {
      if (sk === "Form 4" || sk === "Form 3" || sk === "Form 5") {
        return truncateDiscoverSummary(`Recent insider filings for ${issuer}.`, 200);
      }
      if (sk === "PTR") return truncateDiscoverSummary(`Recent politician disclosures for ${issuer}.`, 200);
      if (sk === "13F") return truncateDiscoverSummary(`Recent institutional 13F activity for ${issuer}.`, 200);
    }
  }

  return null;
}
