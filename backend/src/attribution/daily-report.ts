import { sendResendEmail } from "../alerts/resend.js";
import { previousVilniusDayWindow } from "./tz.js";
import {
  attributionDaySummary,
  attributionSummary,
  claimAttributionReportSend,
  landingDayStats,
  landingFunnelLeaks,
  landingSectionViews,
  landingSourceEngagement,
  markAttributionReportSent,
  releaseAttributionReportClaim,
  type AttributionDayRow,
  type AttributionSummaryRow,
  type LandingDayStats,
  type SectionViewRow,
  type SourceEngagementRow,
} from "./store.js";

/** Fixed email buckets — always four rows. */
const REPORT_BUCKETS = [
  { key: "yt", label: "YouTube", color: "#FF0033", refs: new Set(["yt"]) },
  { key: "ig", label: "Instagram", color: "#E1306C", refs: new Set(["ig"]) },
  { key: "twt", label: "X / Twitter", color: "#1D9BF0", refs: new Set(["twt"]) },
  { key: "other", label: "Other", color: "#8B8B93", refs: null as Set<string> | null },
] as const;

type ReportBucketKey = (typeof REPORT_BUCKETS)[number]["key"];

const C = {
  bg: "#080809",
  card: "#141416",
  ink: "#ffffff",
  muted: "#9a9aa2",
  rule: "#2a2a2e",
  barTrack: "#1c1c20",
  accent: "#e8e8ea",
  good: "#5cb88a",
  warn: "#d4a05a",
  bad: "#d4726a",
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
  color: string;
  visits: number;
  signups: number;
  checkouts: number;
  paid: number;
};

function rollupDay(rows: AttributionDayRow[]): DayBucketRow[] {
  const map = new Map<ReportBucketKey, DayBucketRow>();
  for (const b of REPORT_BUCKETS) {
    map.set(b.key, { key: b.key, label: b.label, color: b.color, visits: 0, signups: 0, checkouts: 0, paid: 0 });
  }
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
  const map = new Map<ReportBucketKey, DayBucketRow>();
  for (const b of REPORT_BUCKETS) {
    map.set(b.key, { key: b.key, label: b.label, color: b.color, visits: 0, signups: 0, checkouts: 0, paid: 0 });
  }
  for (const r of rows) {
    const row = map.get(bucketKeyForRef(r.ref))!;
    row.visits += r.visits;
    row.signups += r.signups;
    row.checkouts += r.checkouts;
    row.paid += r.paid;
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

function pctNum(num: number, den: number): number {
  if (!den) return 0;
  return Math.max(0, Math.min(100, (100 * num) / den));
}

function pctLabel(num: number, den: number): string {
  if (!den) return "—";
  const p = pctNum(num, den);
  return `${p.toFixed(den < 20 ? 0 : 1)}%`;
}

/** Email-safe horizontal bar (nested table). */
function barHtml(value: number, max: number, color: string, height = 10): string {
  const width = max > 0 ? Math.max(value > 0 ? 4 : 0, Math.round((100 * value) / max)) : 0;
  const rest = Math.max(0, 100 - width);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
    <tr>
      ${width > 0 ? `<td width="${width}%" style="background-color:${color};height:${height}px;font-size:0;line-height:0;">&nbsp;</td>` : ""}
      ${rest > 0 ? `<td width="${rest}%" style="background-color:${C.barTrack};height:${height}px;font-size:0;line-height:0;">&nbsp;</td>` : ""}
    </tr>
  </table>`;
}

function kpiCard(label: string, value: string, sub?: string): string {
  return `<td width="25%" valign="top" style="padding:4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background-color:${C.card};border:1px solid ${C.rule};border-radius:10px">
      <tr><td style="padding:14px 12px">
        <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};margin:0 0 6px">${escapeHtml(label)}</div>
        <div style="font-size:26px;font-weight:700;color:${C.ink};line-height:1.1;margin:0">${escapeHtml(value)}</div>
        ${sub ? `<div style="font-size:12px;color:${C.muted};margin-top:6px">${escapeHtml(sub)}</div>` : ""}
      </td></tr>
    </table>
  </td>`;
}

function sectionTitle(title: string): string {
  return `<div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:${C.muted};margin:24px 0 10px">${escapeHtml(title)}</div>`;
}

function cardWrap(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background-color:${C.card};border:1px solid ${C.rule};border-radius:12px">
    <tr><td style="padding:16px">${inner}</td></tr>
  </table>`;
}

function funnelHtml(steps: Array<{ label: string; value: number; color: string }>): string {
  const max = Math.max(...steps.map((s) => s.value), 1);
  const rows = steps
    .map((s, i) => {
      const prev = i === 0 ? s.value : steps[i - 1]!.value;
      const drop = i === 0 ? "" : ` · ${pctLabel(s.value, prev)} of previous`;
      return `<tr>
        <td style="padding:8px 0 2px;font-size:13px;color:${C.ink}">${escapeHtml(s.label)}</td>
        <td style="padding:8px 0 2px;font-size:13px;color:${C.ink};text-align:right;font-weight:700">${s.value}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:0 0 10px">${barHtml(s.value, max, s.color, 12)}
          <div style="font-size:11px;color:${C.muted};margin-top:4px">${pctLabel(s.value, max)} of top${escapeHtml(drop)}</div>
        </td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">${rows}</table>`;
}

function sourceBarsHtml(
  rows: DayBucketRow[],
  metric: "visits" | "paid",
): string {
  const max = Math.max(...rows.map((r) => r[metric]), 1);
  const body = rows
    .map(
      (r) => `<tr>
      <td width="28%" style="padding:7px 8px 7px 0;font-size:13px;color:${C.ink};white-space:nowrap">${escapeHtml(r.label)}</td>
      <td style="padding:7px 0">${barHtml(r[metric], max, r.color, 10)}</td>
      <td width="44" style="padding:7px 0 7px 10px;font-size:13px;color:${C.ink};text-align:right;font-weight:600">${r[metric]}</td>
    </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">${body}</table>`;
}

type EngBucket = {
  key: ReportBucketKey;
  label: string;
  color: string;
  visitors: number;
  sessions: number;
  activeSum: number;
  activeN: number;
  pricing: number;
  buys: number;
};

function rollEngagement(rows: SourceEngagementRow[]): EngBucket[] {
  const map = new Map<ReportBucketKey, EngBucket>();
  for (const b of REPORT_BUCKETS) {
    map.set(b.key, {
      key: b.key,
      label: b.label,
      color: b.color,
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

function engagementBarsHtml(rows: EngBucket[]): string {
  const max = Math.max(...rows.map((r) => r.visitors), 1);
  const body = rows
    .map((r) => {
      const avg = r.activeN ? Math.round(r.activeSum / r.activeN) : 0;
      return `<tr>
      <td width="28%" style="padding:8px 8px 2px 0;font-size:13px;color:${C.ink}">${escapeHtml(r.label)}</td>
      <td style="padding:8px 0 2px">${barHtml(r.visitors, max, r.color, 10)}</td>
      <td width="44" style="padding:8px 0 2px 10px;font-size:13px;color:${C.ink};text-align:right;font-weight:600">${r.visitors}</td>
    </tr>
    <tr>
      <td colspan="3" style="padding:0 0 10px;font-size:11px;color:${C.muted}">
        ${r.sessions} sessions · avg active ${fmtMs(avg)} · pricing ${r.pricing} · buys ${r.buys}
      </td>
    </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">${body}</table>`;
}

function scrollHtml(stats: LandingDayStats): string {
  const base = Math.max(stats.sessions, 1);
  const steps = [
    { label: "25%", value: stats.scroll_25 },
    { label: "50%", value: stats.scroll_50 },
    { label: "75%", value: stats.scroll_75 },
    { label: "90%", value: stats.scroll_90 },
    { label: "100%", value: stats.scroll_100 },
  ];
  const cells = steps
    .map((s) => {
      const p = pctNum(s.value, base);
      const color = p >= 50 ? C.good : p >= 25 ? C.warn : C.bad;
      return `<td width="20%" valign="bottom" style="padding:0 3px;text-align:center">
        <div style="font-size:12px;font-weight:700;color:${C.ink};margin-bottom:6px">${s.value}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;height:72px">
          <tr><td valign="bottom" style="background-color:${C.barTrack};height:72px;border-radius:6px">
            <div style="background-color:${color};height:${Math.max(p > 0 ? 8 : 0, Math.round(0.72 * p))}px;border-radius:6px;font-size:0;line-height:0;">&nbsp;</div>
          </td></tr>
        </table>
        <div style="font-size:11px;color:${C.muted};margin-top:6px">${escapeHtml(s.label)}</div>
      </td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${cells}</tr></table>
    <div style="font-size:11px;color:${C.muted};margin-top:10px">Sessions reaching each scroll depth (of ${stats.sessions} sessions)</div>`;
}

function sectionsHtml(sections: SectionViewRow[]): string {
  if (!sections.length) {
    return `<div style="font-size:13px;color:${C.muted}">No section views yet.</div>`;
  }
  const top = sections.slice(0, 6);
  const max = Math.max(...top.map((s) => s.viewers), 1);
  const body = top
    .map(
      (s) => `<tr>
      <td width="34%" style="padding:6px 8px 6px 0;font-size:13px;color:${C.ink}">${escapeHtml(s.section)}</td>
      <td style="padding:6px 0">${barHtml(s.viewers, max, C.accent, 8)}</td>
      <td width="40" style="padding:6px 0 6px 10px;font-size:13px;color:${C.ink};text-align:right">${s.viewers}</td>
    </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${body}</table>`;
}

function leakPills(leaks: { pricing_no_buy: number; buy_no_checkout: number; checkout_no_paid: number }): string {
  const items = [
    { label: "Saw pricing, no buy", n: leaks.pricing_no_buy, color: C.warn },
    { label: "Buy click, no checkout", n: leaks.buy_no_checkout, color: C.bad },
    { label: "Checkout, no paid", n: leaks.checkout_no_paid, color: C.bad },
  ];
  return items
    .map(
      (it) => `<tr>
      <td style="padding:6px 0;font-size:13px;color:${C.ink}">${escapeHtml(it.label)}</td>
      <td style="padding:6px 0;text-align:right">
        <span style="display:inline-block;min-width:28px;padding:4px 10px;border-radius:999px;background-color:${C.barTrack};color:${it.n ? it.color : C.muted};font-size:13px;font-weight:700">${it.n}</span>
      </td>
    </tr>`,
    )
    .join("");
}

function buildHeadline(opts: {
  stats: LandingDayStats;
  dayPaid: number;
  dayVisits: number;
  sourceRows: SourceEngagementRow[];
  leaks: { pricing_no_buy: number; buy_no_checkout: number; checkout_no_paid: number };
}): string {
  const { stats, dayPaid, sourceRows, leaks } = opts;
  if (stats.unique_visitors === 0 && stats.sessions === 0 && opts.dayVisits === 0) {
    return "Quiet day — no landing traffic.";
  }
  if (dayPaid > 0) {
    return `${dayPaid} paid · ${stats.unique_visitors} visitors · ${fmtMs(stats.avg_active_ms)} avg active`;
  }
  const top = [...sourceRows].sort((a, b) => b.visitors - a.visitors)[0];
  const sourceBit = top?.visitors ? `${bucketLabel(top.ref)} led traffic` : "Mixed traffic";
  if (leaks.pricing_no_buy > leaks.buy_no_checkout && leaks.pricing_no_buy > 0) {
    return `${sourceBit} · ${leaks.pricing_no_buy} reached pricing without buying`;
  }
  if (leaks.checkout_no_paid > 0) {
    return `${sourceBit} · ${leaks.checkout_no_paid} opened checkout without paying`;
  }
  return `${sourceBit} · ${stats.unique_visitors} visitors · ${stats.avg_scroll_pct}% avg scroll`;
}

function buildInsights(opts: {
  stats: LandingDayStats;
  dayPaid: number;
  dayVisits: number;
  sourceRows: SourceEngagementRow[];
  sections: SectionViewRow[];
  leaks: { pricing_no_buy: number; buy_no_checkout: number; checkout_no_paid: number };
}): string[] {
  const { stats, dayPaid, sourceRows, sections, leaks } = opts;
  const lines: string[] = [];
  if (stats.unique_visitors === 0 && stats.sessions === 0 && opts.dayVisits === 0) {
    return ["No landing traffic yesterday."];
  }
  if (stats.unique_visitors > 0 && stats.unique_visitors < 20) {
    lines.push(`Small sample (${stats.unique_visitors} visitors).`);
  }
  if (sourceRows.length) {
    const top = [...sourceRows].sort((a, b) => b.visitors - a.visitors)[0];
    if (top?.visitors) lines.push(`${bucketLabel(top.ref)} brought the most visitors (${top.visitors}).`);
  }
  if (stats.unique_visitors >= 5 && stats.pricing_views / stats.unique_visitors < 0.35) {
    lines.push(`Most people never reached pricing (${stats.pricing_views}/${stats.unique_visitors}).`);
  }
  if (leaks.buy_no_checkout > 0) lines.push(`${leaks.buy_no_checkout} clicked Buy but checkout never opened.`);
  if (leaks.checkout_no_paid > 0 && dayPaid === 0) {
    lines.push(`${leaks.checkout_no_paid} opened checkout with no purchase.`);
  }
  if (dayPaid > 0) lines.push(`${dayPaid} confirmed purchase${dayPaid === 1 ? "" : "s"}.`);
  if (sections.length >= 2) {
    const most = sections[0]!;
    const least = sections[sections.length - 1]!;
    if (most.section !== least.section) {
      lines.push(`Hottest section: ${most.section}. Coldest: ${least.section}.`);
    }
  }
  return lines.slice(0, 4);
}

function bucketLabel(ref: string): string {
  const key = bucketKeyForRef(ref);
  return REPORT_BUCKETS.find((b) => b.key === key)?.label ?? ref;
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
    const [dayRaw, allRaw, stats, sourceEng, sections, leaks] = await Promise.all([
      attributionDaySummary(start, end),
      attributionSummary(),
      landingDayStats(start, end),
      landingSourceEngagement(start, end),
      landingSectionViews(start, end),
      landingFunnelLeaks(start, end),
    ]);
    const dayRows = rollupDay(dayRaw);
    const allRows = rollupAll(allRaw);
    const dayTot = sumDay(dayRows);
    const eng = rollEngagement(sourceEng);
    const insights = buildInsights({
      stats,
      dayPaid: dayTot.paid,
      dayVisits: dayTot.visits,
      sourceRows: sourceEng,
      sections,
      leaks,
    });
    const headline = buildHeadline({
      stats,
      dayPaid: dayTot.paid,
      dayVisits: dayTot.visits,
      sourceRows: sourceEng,
      leaks,
    });

    const subject = `MercerLine · ${label} · ${dayTot.paid} paid · ${stats.unique_visitors || dayTot.visits} visitors`;
    const funnelVisitors = Math.max(stats.unique_visitors, dayTot.visits);
    const funnelSteps = [
      { label: "Visitors", value: funnelVisitors, color: "#6ea8fe" },
      { label: "Pricing viewed", value: stats.pricing_views, color: "#8bb4ff" },
      { label: "Buy clicked", value: stats.buy_clicks, color: C.warn },
      { label: "Checkout opened", value: stats.checkout_opens, color: "#e0a35a" },
      { label: "Paid", value: dayTot.paid, color: C.good },
    ];

    const insightHtml = insights
      .map(
        (line, i) =>
          `<tr><td style="padding:${i ? "8px" : "0"} 0 0;font-size:14px;color:${C.ink};line-height:1.4">• ${escapeHtml(line)}</td></tr>`,
      )
      .join("");

    const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:${C.bg};color:${C.ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background-color:${C.bg}">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:640px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
        <tr><td style="padding:0 4px 18px">
          <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${C.muted}">MercerLine daily</div>
          <div style="font-size:28px;font-weight:700;color:${C.ink};margin:8px 0 6px;line-height:1.15">${escapeHtml(label)}</div>
          <div style="font-size:15px;color:${C.accent};line-height:1.35">${escapeHtml(headline)}</div>
          <div style="font-size:12px;color:${C.muted};margin-top:8px">${escapeHtml(timeZone)} day</div>
        </td></tr>

        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr>
              ${kpiCard("Visitors", String(stats.unique_visitors || dayTot.visits), `${stats.returning_visitors} returning`)}
              ${kpiCard("Sessions", String(stats.sessions), `${fmtMs(stats.avg_active_ms)} active`)}
              ${kpiCard("Scroll", `${stats.avg_scroll_pct}%`, "avg max depth")}
              ${kpiCard("Paid", String(dayTot.paid), `${dayTot.checkouts} checkouts`)}
            </tr>
          </table>
        </td></tr>

        <tr><td>
          ${sectionTitle("Conversion funnel")}
          ${cardWrap(funnelHtml(funnelSteps))}
        </td></tr>

        <tr><td>
          ${sectionTitle("Where traffic came from")}
          ${cardWrap(`
            <div style="font-size:12px;color:${C.muted};margin:0 0 10px">Referral visits yesterday</div>
            ${sourceBarsHtml(dayRows, "visits")}
            <div style="height:1px;background-color:${C.rule};margin:16px 0"></div>
            <div style="font-size:12px;color:${C.muted};margin:0 0 10px">Sessions + engagement by source</div>
            ${engagementBarsHtml(eng)}
          `)}
        </td></tr>

        <tr><td>
          ${sectionTitle("Scroll depth")}
          ${cardWrap(scrollHtml(stats))}
        </td></tr>

        <tr><td>
          ${sectionTitle("Sections viewed")}
          ${cardWrap(sectionsHtml(sections))}
        </td></tr>

        <tr><td>
          ${sectionTitle("Leaks")}
          ${cardWrap(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${leakPills(leaks)}</table>`)}
        </td></tr>

        <tr><td>
          ${sectionTitle("Takeaways")}
          ${cardWrap(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${insightHtml}</table>`)}
        </td></tr>

        <tr><td>
          ${sectionTitle("All-time paid by source")}
          ${cardWrap(sourceBarsHtml(allRows, "paid"))}
        </td></tr>

        <tr><td style="padding:20px 4px 0;font-size:11px;color:${C.muted};line-height:1.5">
          Paid counts only after verified Whop webhook · one email per ${escapeHtml(timeZone)} day<br>
          /yt · /ig · /twt
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = [
      `MercerLine daily — ${label}`,
      headline,
      "",
      `Visitors ${stats.unique_visitors || dayTot.visits} · Sessions ${stats.sessions} · Scroll ${stats.avg_scroll_pct}% · Paid ${dayTot.paid}`,
      "",
      "FUNNEL",
      ...funnelSteps.map((s) => `${s.label}: ${s.value}`),
      "",
      "SOURCES",
      ...dayRows.map((r) => `${r.label}: ${r.visits} visits, ${r.paid} paid`),
      "",
      "TAKEAWAYS",
      ...insights.map((l) => `- ${l}`),
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
