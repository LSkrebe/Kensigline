import { sendResendEmail } from "../alerts/resend.js";
import { previousVilniusDayWindow } from "./tz.js";
import {
  attributionDaySummary,
  attributionSummary,
  claimAttributionReportSend,
  landingDayStats,
  landingSectionViews,
  landingSourceEngagement,
  markAttributionReportSent,
  releaseAttributionReportClaim,
  type AttributionDayRow,
  type AttributionSummaryRow,
  type SectionViewRow,
  type SourceEngagementRow,
} from "./store.js";

/** Fixed email buckets — always four rows. */
const REPORT_BUCKETS = [
  { key: "yt", label: "YouTube", refs: new Set(["yt"]) },
  { key: "ig", label: "Instagram", refs: new Set(["ig"]) },
  { key: "twt", label: "X / Twitter", refs: new Set(["twt"]) },
  { key: "other", label: "Other", refs: null as Set<string> | null },
] as const;

/** Landing page order — depth reads top → bottom. */
const PAGE_SECTIONS = [
  { id: "story", label: "1  Story" },
  { id: "together", label: "2  Together" },
  { id: "product", label: "3  Product" },
  { id: "leaders", label: "4  Leaders" },
  { id: "coverage", label: "5  Coverage" },
  { id: "reviews", label: "6  Reviews" },
  { id: "pricing", label: "7  Pricing" },
  { id: "faq", label: "8  FAQ" },
  { id: "cta", label: "9  CTA" },
] as const;

type ReportBucketKey = (typeof REPORT_BUCKETS)[number]["key"];

const C = {
  ink: "#111111",
  muted: "#666666",
  head: "#f6f6f6",
  line: "#eeeeee",
};

export function attributionReportRecipient(): string {
  return String(process.env.ATTRIBUTION_REPORT_TO ?? "lukas.skrebe@gmail.com").trim() || "lukas.skrebe@gmail.com";
}

export function attributionReportEnabled(): boolean {
  return String(process.env.ATTRIBUTION_REPORT_ENABLED ?? "1").trim() !== "0";
}

function bucketKeyForRef(ref: string): ReportBucketKey {
  const r = String(ref ?? "").trim().toLowerCase();
  for (const b of REPORT_BUCKETS) {
    if (b.refs?.has(r)) return b.key;
  }
  return "other";
}

type DayBucketRow = {
  key: ReportBucketKey;
  label: string;
  visits: number;
  signups: number;
  checkouts: number;
  paid: number;
};

type EngBucket = {
  key: ReportBucketKey;
  label: string;
  visitors: number;
  sessions: number;
  activeSum: number;
  activeN: number;
  pricing: number;
  buys: number;
};

function emptyBuckets(): DayBucketRow[] {
  return REPORT_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    visits: 0,
    signups: 0,
    checkouts: 0,
    paid: 0,
  }));
}

function rollupDay(rows: AttributionDayRow[]): DayBucketRow[] {
  const map = new Map(emptyBuckets().map((r) => [r.key, r]));
  for (const r of rows) {
    const row = map.get(bucketKeyForRef(r.ref))!;
    row.visits += r.visits;
    row.signups += r.signups;
    row.checkouts += r.checkouts;
    row.paid += r.paid ?? 0;
  }
  return REPORT_BUCKETS.map((b) => map.get(b.key)!);
}

function rollupAll(rows: AttributionSummaryRow[]): DayBucketRow[] {
  const map = new Map(emptyBuckets().map((r) => [r.key, r]));
  for (const r of rows) {
    const row = map.get(bucketKeyForRef(r.ref))!;
    row.visits += r.visits;
    row.signups += r.signups;
    row.checkouts += r.checkouts;
    row.paid += r.paid;
  }
  return REPORT_BUCKETS.map((b) => map.get(b.key)!);
}

function rollEngagement(rows: SourceEngagementRow[]): EngBucket[] {
  const map = new Map<ReportBucketKey, EngBucket>();
  for (const b of REPORT_BUCKETS) {
    map.set(b.key, {
      key: b.key,
      label: b.label,
      visitors: 0,
      sessions: 0,
      activeSum: 0,
      activeN: 0,
      pricing: 0,
      buys: 0,
    });
  }
  for (const r of rows) {
    const bucket = map.get(bucketKeyForRef(r.ref))!;
    bucket.visitors += r.visitors;
    bucket.sessions += r.sessions;
    bucket.activeSum += r.avg_active_ms * r.sessions;
    bucket.activeN += r.sessions;
    bucket.pricing += r.pricing_views;
    bucket.buys += r.buy_clicks;
  }
  return REPORT_BUCKETS.map((b) => map.get(b.key)!);
}

function sumDay(rows: DayBucketRow[]) {
  return rows.reduce(
    (acc, r) => {
      acc.visits += r.visits;
      acc.signups += r.signups;
      acc.checkouts += r.checkouts;
      acc.paid += r.paid;
      return acc;
    },
    { visits: 0, signups: 0, checkouts: 0, paid: 0 },
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtMs(ms: number): string {
  const n = Math.max(0, Math.round(ms / 1000));
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function pctLabel(num: number, den: number): string {
  if (!den) return "-";
  const p = Math.max(0, Math.min(100, (100 * num) / den));
  return `${p.toFixed(den < 20 ? 0 : 1)}%`;
}

function sectionLabel(title: string): string {
  return `<div style="font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px">${escapeHtml(title)}</div>`;
}

function th(label: string, align: "left" | "right" = "right"): string {
  return `<th style="padding:6px 6px;font-size:12px;color:${C.muted};text-align:${align};font-weight:600;background:${C.head}">${escapeHtml(label)}</th>`;
}

function td(value: string | number, opts?: { align?: "left" | "right"; bold?: boolean; first?: boolean }): string {
  const align = opts?.align ?? "right";
  const weight = opts?.bold ? "700" : "400";
  const pad = opts?.first ? "6px 8px" : "6px 6px";
  return `<td style="padding:${pad};border-bottom:1px solid ${C.line};font-size:13px;color:${C.ink};text-align:${align};font-weight:${weight}">${typeof value === "number" ? value : escapeHtml(value)}</td>`;
}

function sourceTableHtml(rows: DayBucketRow[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr>${td(r.label, { align: "left", first: true })}${td(r.visits)}${td(r.signups)}${td(r.checkouts)}${td(r.paid, { bold: true })}</tr>`,
    )
    .join("");
  const t = sumDay(rows);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead><tr>${th("Source", "left")}${th("Visits")}${th("Signups")}${th("Checkouts")}${th("Paid")}</tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr>
      ${td("Total", { align: "left", bold: true, first: true })}${td(t.visits, { bold: true })}${td(t.signups, { bold: true })}${td(t.checkouts, { bold: true })}${td(t.paid, { bold: true })}
    </tr></tfoot>
  </table>`;
}

function funnelTableHtml(steps: Array<{ label: string; value: number }>): string {
  const top = steps[0]?.value ?? 0;
  const body = steps
    .map((s, i) => {
      const prev = i === 0 ? s.value : steps[i - 1]!.value;
      return `<tr>
        ${td(s.label, { align: "left", first: true })}
        ${td(s.value, { bold: true })}
        ${td(i === 0 ? "-" : pctLabel(s.value, prev))}
        ${td(pctLabel(s.value, top))}
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead><tr>${th("Step", "left")}${th("Count")}${th("Of prev")}${th("Of top")}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function overviewTableHtml(rows: Array<{ label: string; value: string }>): string {
  const body = rows
    .map((r) => `<tr>${td(r.label, { align: "left", first: true })}${td(r.value, { bold: true })}</tr>`)
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead><tr>${th("Metric", "left")}${th("Value")}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function engagementTableHtml(rows: EngBucket[]): string {
  const body = rows
    .map((r) => {
      const avg = r.activeN ? Math.round(r.activeSum / r.activeN) : 0;
      return `<tr>
        ${td(r.label, { align: "left", first: true })}
        ${td(r.visitors)}
        ${td(r.sessions)}
        ${td(fmtMs(avg))}
        ${td(r.pricing)}
        ${td(r.buys)}
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead><tr>${th("Source", "left")}${th("Visitors")}${th("Sessions")}${th("Avg active")}${th("Pricing")}${th("Buys")}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function pageDepthTableHtml(sections: SectionViewRow[], visitors: number): string {
  const byId = new Map(sections.map((s) => [s.section, s.viewers]));
  const base = Math.max(visitors, 1);
  const known = new Set<string>(PAGE_SECTIONS.map((s) => s.id));
  const rows: Array<{ label: string; viewers: number }> = PAGE_SECTIONS.map((s) => ({
    label: s.label,
    viewers: byId.get(s.id) ?? 0,
  }));
  for (const s of sections) {
    if (!known.has(s.section)) {
      rows.push({ label: s.section, viewers: s.viewers });
    }
  }
  const body = rows
    .map(
      (r) =>
        `<tr>${td(r.label, { align: "left", first: true })}${td(r.viewers, { bold: true })}${td(pctLabel(r.viewers, base))}</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead><tr>${th("Reached section", "left")}${th("People")}${th("Of visitors")}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

export type AttributionDailyReportResult =
  | { ok: true; day: string; to: string; id: string; dayRows: number; allTimeRows: number }
  | { ok: false; reason: string };

export async function runAttributionDailyReport(opts?: {
  to?: string;
  now?: Date;
  force?: boolean;
}): Promise<AttributionDailyReportResult> {
  if (!attributionReportEnabled() && !opts?.to) {
    return { ok: false, reason: "disabled" };
  }

  const { start, end, label, timeZone } = previousVilniusDayWindow(opts?.now);
  const to = String(opts?.to ?? attributionReportRecipient()).trim();
  if (!to) return { ok: false, reason: "no_recipient" };

  const dayKey = `vilnius:${label}`;
  const claimed = await claimAttributionReportSend(dayKey, Boolean(opts?.force));
  if (!claimed) {
    return { ok: false, reason: "already_sent" };
  }

  try {
    const [dayRaw, allRaw, stats, sourceEng, sections] = await Promise.all([
      attributionDaySummary(start, end),
      attributionSummary(),
      landingDayStats(start, end),
      landingSourceEngagement(start, end),
      landingSectionViews(start, end),
    ]);
    const dayRows = rollupDay(dayRaw);
    const allRows = rollupAll(allRaw);
    const engRows = rollEngagement(sourceEng);
    const dayTot = sumDay(dayRows);
    const allTot = sumDay(allRows);
    const visitors = Math.max(stats.unique_visitors, dayTot.visits);

    const funnel = [
      { label: "Visitors", value: visitors },
      { label: "Pricing", value: stats.pricing_views },
      { label: "Buy click", value: stats.buy_clicks },
      { label: "Checkout", value: stats.checkout_opens },
      { label: "Paid", value: dayTot.paid },
    ];

    const overview = [
      { label: "Visitors", value: String(visitors) },
      { label: "Sessions", value: String(stats.sessions) },
      { label: "Returning", value: String(stats.returning_visitors) },
      { label: "Avg active", value: fmtMs(stats.avg_active_ms) },
      { label: "Paid yesterday", value: String(dayTot.paid) },
      { label: "Paid all-time", value: String(allTot.paid) },
    ];

    const subject = `MercerLine ${label}  ${dayTot.paid} paid  ${visitors} visitors`;

    const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px 16px;background:#ffffff;color:${C.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto">
    <div style="font-size:13px;color:${C.muted};margin-bottom:16px">MercerLine  ${escapeHtml(label)}</div>

    ${sectionLabel("Yesterday")}
    <div style="margin-bottom:22px">${overviewTableHtml(overview)}</div>

    ${sectionLabel("Funnel")}
    <div style="margin-bottom:22px">${funnelTableHtml(funnel)}</div>

    ${sectionLabel("Page depth")}
    <div style="margin-bottom:22px">${pageDepthTableHtml(sections, visitors)}</div>

    ${sectionLabel("Engagement by source")}
    <div style="margin-bottom:22px">${engagementTableHtml(engRows)}</div>

    ${sectionLabel("Sources yesterday")}
    <div style="margin-bottom:22px">${sourceTableHtml(dayRows)}</div>

    ${sectionLabel("Total sources all-time")}
    <div style="margin-bottom:8px">${sourceTableHtml(allRows)}</div>

    <div style="font-size:11px;color:${C.muted};margin-top:24px">${escapeHtml(timeZone)}</div>
  </div>
</body>
</html>`;

    const text = [
      `MercerLine ${label}`,
      "",
      "YESTERDAY",
      ...overview.map((r) => `${r.label} ${r.value}`),
      "",
      "FUNNEL",
      ...funnel.map((s) => `${s.label} ${s.value}`),
      "",
      "PAGE DEPTH",
      ...PAGE_SECTIONS.map((s) => {
        const viewers = sections.find((x) => x.section === s.id)?.viewers ?? 0;
        return `${s.label} ${viewers} ${pctLabel(viewers, visitors)}`;
      }),
      "",
      "ENGAGEMENT BY SOURCE",
      ...engRows.map((r) => {
        const avg = r.activeN ? Math.round(r.activeSum / r.activeN) : 0;
        return `${r.label} visitors ${r.visitors} sessions ${r.sessions} avg ${fmtMs(avg)} pricing ${r.pricing} buys ${r.buys}`;
      }),
      "",
      "SOURCES YESTERDAY",
      ...dayRows.map((r) => `${r.label} visits ${r.visits} signups ${r.signups} checkouts ${r.checkouts} paid ${r.paid}`),
      "",
      "TOTAL SOURCES ALL-TIME",
      ...allRows.map((r) => `${r.label} visits ${r.visits} signups ${r.signups} checkouts ${r.checkouts} paid ${r.paid}`),
    ].join("\n");

    const sent = await sendResendEmail({ to, subject, html, text });
    if (!sent.ok) {
      await releaseAttributionReportClaim(dayKey);
      return { ok: false, reason: sent.error };
    }

    await markAttributionReportSent(dayKey, sent.id);
    return {
      ok: true,
      day: label,
      to,
      id: sent.id,
      dayRows: dayRows.length,
      allTimeRows: allRows.length,
    };
  } catch (err) {
    await releaseAttributionReportClaim(dayKey).catch(() => {});
    throw err;
  }
}
