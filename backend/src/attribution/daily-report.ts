import { sendResendEmail } from "../alerts/resend.js";
import { previousVilniusDayWindow } from "./tz.js";
import {
  attributionDaySummary,
  attributionSummary,
  claimAttributionReportSend,
  landingDayStats,
  markAttributionReportSent,
  releaseAttributionReportClaim,
  type AttributionDayRow,
  type AttributionSummaryRow,
  type LandingDayStats,
} from "./store.js";

/** Fixed email buckets — always four rows. */
const REPORT_BUCKETS = [
  { key: "yt", label: "YouTube", color: "#FF0033", refs: new Set(["yt"]) },
  { key: "ig", label: "Instagram", color: "#E1306C", refs: new Set(["ig"]) },
  { key: "twt", label: "X / Twitter", color: "#1D9BF0", refs: new Set(["twt"]) },
  { key: "other", label: "Other", color: "#888888", refs: null as Set<string> | null },
] as const;

type ReportBucketKey = (typeof REPORT_BUCKETS)[number]["key"];

const C = {
  ink: "#111111",
  muted: "#666666",
  track: "#eeeeee",
  good: "#2f9e6b",
  warn: "#b7791f",
  bar: "#444444",
};

/** Soft ceiling for avg-active bar (3 minutes). */
const ACTIVE_BAR_CAP_MS = 3 * 60 * 1000;

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

function emptyBuckets(): DayBucketRow[] {
  return REPORT_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    color: b.color,
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

function barHtml(value: number, max: number, color: string, height = 8): string {
  const width = max > 0 ? Math.max(value > 0 ? 4 : 0, Math.round((100 * value) / max)) : 0;
  const rest = Math.max(0, 100 - width);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
    <tr>
      ${width > 0 ? `<td width="${width}%" style="background-color:${color};height:${height}px;font-size:0;line-height:0;">&nbsp;</td>` : ""}
      ${rest > 0 ? `<td width="${rest}%" style="background-color:${C.track};height:${height}px;font-size:0;line-height:0;">&nbsp;</td>` : ""}
    </tr>
  </table>`;
}

function sectionLabel(title: string): string {
  return `<div style="font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px">${escapeHtml(title)}</div>`;
}

function metricRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:4px 0;font-size:14px;color:${C.muted}">${escapeHtml(label)}</td>
    <td style="padding:4px 0;font-size:14px;color:${C.ink};text-align:right;font-weight:600">${escapeHtml(value)}</td>
  </tr>`;
}

function funnelHtml(steps: Array<{ label: string; value: number; color: string }>): string {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return steps
    .map((s, i) => {
      const prev = i === 0 ? s.value : steps[i - 1]!.value;
      const rate = i === 0 ? "" : ` ${pctLabel(s.value, prev)}`;
      return `<tr>
        <td style="padding:6px 0 2px;font-size:14px;color:${C.ink}">${escapeHtml(s.label)}</td>
        <td style="padding:6px 0 2px;font-size:14px;color:${C.ink};text-align:right;font-weight:600">${s.value}${escapeHtml(rate)}</td>
      </tr>
      <tr><td colspan="2" style="padding:0 0 8px">${barHtml(s.value, max, s.color)}</td></tr>`;
    })
    .join("");
}

function sourceTableHtml(rows: DayBucketRow[]): string {
  const body = rows
    .map(
      (r) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;color:${C.ink}">${escapeHtml(r.label)}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #eee;font-size:13px;color:${C.ink};text-align:right">${r.visits}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #eee;font-size:13px;color:${C.ink};text-align:right">${r.signups}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #eee;font-size:13px;color:${C.ink};text-align:right">${r.checkouts}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #eee;font-size:13px;color:${C.ink};text-align:right;font-weight:600">${r.paid}</td>
      </tr>`,
    )
    .join("");
  const t = sumDay(rows);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
    <thead>
      <tr style="background:#f6f6f6">
        <th style="padding:6px 8px;font-size:12px;color:${C.muted};text-align:left;font-weight:600">Source</th>
        <th style="padding:6px 4px;font-size:12px;color:${C.muted};text-align:right;font-weight:600">Visits</th>
        <th style="padding:6px 4px;font-size:12px;color:${C.muted};text-align:right;font-weight:600">Signups</th>
        <th style="padding:6px 4px;font-size:12px;color:${C.muted};text-align:right;font-weight:600">Checkouts</th>
        <th style="padding:6px 4px;font-size:12px;color:${C.muted};text-align:right;font-weight:600">Paid</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
    <tfoot>
      <tr>
        <td style="padding:8px 8px 0;font-size:13px;color:${C.ink};font-weight:700">Total</td>
        <td style="padding:8px 4px 0;font-size:13px;color:${C.ink};text-align:right;font-weight:700">${t.visits}</td>
        <td style="padding:8px 4px 0;font-size:13px;color:${C.ink};text-align:right;font-weight:700">${t.signups}</td>
        <td style="padding:8px 4px 0;font-size:13px;color:${C.ink};text-align:right;font-weight:700">${t.checkouts}</td>
        <td style="padding:8px 4px 0;font-size:13px;color:${C.ink};text-align:right;font-weight:700">${t.paid}</td>
      </tr>
    </tfoot>
  </table>`;
}

function scrollDepthHtml(stats: LandingDayStats): string {
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
      const p = Math.max(0, Math.min(100, (100 * s.value) / base));
      const h = Math.max(p > 0 ? 6 : 0, Math.round(0.64 * p));
      const color = p >= 50 ? C.good : p >= 25 ? C.warn : C.bar;
      return `<td width="20%" valign="bottom" style="padding:0 3px;text-align:center">
        <div style="font-size:12px;font-weight:700;color:${C.ink};margin-bottom:4px">${Math.round(p)}%</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;height:64px">
          <tr><td valign="bottom" style="background-color:${C.track};height:64px">
            <div style="background-color:${color};height:${h}px;font-size:0;line-height:0;">&nbsp;</div>
          </td></tr>
        </table>
        <div style="font-size:11px;color:${C.muted};margin-top:6px">${escapeHtml(s.label)}</div>
        <div style="font-size:11px;color:${C.ink}">${s.value}</div>
      </td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${cells}</tr></table>`;
}

function activeTimeHtml(avgActiveMs: number): string {
  const shown = Math.min(avgActiveMs, ACTIVE_BAR_CAP_MS);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
    <tr>
      <td style="padding:0 0 6px;font-size:14px;color:${C.ink}">Avg active</td>
      <td style="padding:0 0 6px;font-size:14px;color:${C.ink};text-align:right;font-weight:600">${escapeHtml(fmtMs(avgActiveMs))}</td>
    </tr>
    <tr><td colspan="2">${barHtml(shown, ACTIVE_BAR_CAP_MS, C.bar, 10)}</td></tr>
    <tr><td colspan="2" style="padding-top:4px;font-size:11px;color:${C.muted}">scale 0 to 3m</td></tr>
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
    const [dayRaw, allRaw, stats] = await Promise.all([
      attributionDaySummary(start, end),
      attributionSummary(),
      landingDayStats(start, end),
    ]);
    const dayRows = rollupDay(dayRaw);
    const allRows = rollupAll(allRaw);
    const dayTot = sumDay(dayRows);
    const allTot = sumDay(allRows);
    const visitors = Math.max(stats.unique_visitors, dayTot.visits);

    const funnel = [
      { label: "Visitors", value: visitors, color: "#555555" },
      { label: "Pricing", value: stats.pricing_views, color: "#777777" },
      { label: "Buy click", value: stats.buy_clicks, color: C.warn },
      { label: "Checkout", value: stats.checkout_opens, color: C.warn },
      { label: "Paid", value: dayTot.paid, color: C.good },
    ];

    const subject = `MercerLine ${label}  ${dayTot.paid} paid  ${visitors} visitors`;

    const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px 16px;background:#ffffff;color:${C.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto">
    <div style="font-size:13px;color:${C.muted};margin-bottom:14px">MercerLine  ${escapeHtml(label)}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:22px">
      ${metricRow("Visitors", String(visitors))}
      ${metricRow("Sessions", String(stats.sessions))}
      ${metricRow("Returning", String(stats.returning_visitors))}
      ${metricRow("Paid", String(dayTot.paid))}
      ${metricRow("All-time paid", String(allTot.paid))}
    </table>

    ${sectionLabel("Funnel")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:22px">${funnelHtml(funnel)}</table>

    ${sectionLabel("Time on page")}
    <div style="margin-bottom:22px">${activeTimeHtml(stats.avg_active_ms)}</div>

    ${sectionLabel("Scroll depth")}
    <div style="margin-bottom:22px">${scrollDepthHtml(stats)}</div>

    ${sectionLabel("Sources yesterday")}
    <div style="margin-bottom:22px">${sourceTableHtml(dayRows)}</div>

    ${sectionLabel("Sources all-time")}
    <div>${sourceTableHtml(allRows)}</div>

    <div style="font-size:11px;color:${C.muted};margin-top:24px">${escapeHtml(timeZone)}</div>
  </div>
</body>
</html>`;

    const text = [
      `MercerLine ${label}`,
      `Visitors ${visitors}`,
      `Sessions ${stats.sessions}`,
      `Returning ${stats.returning_visitors}`,
      `Paid ${dayTot.paid}`,
      `All-time paid ${allTot.paid}`,
      `Avg active ${fmtMs(stats.avg_active_ms)}`,
      `Scroll avg ${stats.avg_scroll_pct}%`,
      "",
      "FUNNEL",
      ...funnel.map((s) => `${s.label} ${s.value}`),
      "",
      "SCROLL",
      `25% ${stats.scroll_25}`,
      `50% ${stats.scroll_50}`,
      `75% ${stats.scroll_75}`,
      `90% ${stats.scroll_90}`,
      `100% ${stats.scroll_100}`,
      "",
      "SOURCES YESTERDAY",
      ...dayRows.map((r) => `${r.label} visits ${r.visits} signups ${r.signups} checkouts ${r.checkouts} paid ${r.paid}`),
      "",
      "SOURCES ALL-TIME",
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
