import { sendResendEmail } from "../alerts/resend.js";
import { previousVilniusDayWindow } from "./tz.js";
import {
  attributionDaySummary,
  claimAttributionReportSend,
  landingDayStats,
  landingFunnelLeaks,
  landingSourceEngagement,
  markAttributionReportSent,
  releaseAttributionReportClaim,
  type AttributionDayRow,
  type SourceEngagementRow,
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

function bucketLabel(ref: string): string {
  const key = bucketKeyForRef(ref);
  return REPORT_BUCKETS.find((b) => b.key === key)?.label ?? ref;
}

type DayBucketRow = {
  key: ReportBucketKey;
  label: string;
  color: string;
  visits: number;
  paid: number;
};

function rollupDay(rows: AttributionDayRow[]): DayBucketRow[] {
  const map = new Map<ReportBucketKey, DayBucketRow>();
  for (const b of REPORT_BUCKETS) {
    map.set(b.key, { key: b.key, label: b.label, color: b.color, visits: 0, paid: 0 });
  }
  for (const r of rows) {
    const row = map.get(bucketKeyForRef(r.ref))!;
    row.visits += r.visits;
    row.paid += r.paid ?? 0;
  }
  return REPORT_BUCKETS.map((b) => map.get(b.key)!);
}

function sumDay(rows: DayBucketRow[]) {
  return rows.reduce(
    (acc, r) => {
      acc.visits += r.visits;
      acc.paid += r.paid;
      return acc;
    },
    { visits: 0, paid: 0 },
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
  if (!den) return "—";
  const p = Math.max(0, Math.min(100, (100 * num) / den));
  return `${p.toFixed(den < 20 ? 0 : 1)}%`;
}

function barHtml(value: number, max: number, color: string): string {
  const width = max > 0 ? Math.max(value > 0 ? 4 : 0, Math.round((100 * value) / max)) : 0;
  const rest = Math.max(0, 100 - width);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
    <tr>
      ${width > 0 ? `<td width="${width}%" style="background-color:${color};height:8px;font-size:0;line-height:0;">&nbsp;</td>` : ""}
      ${rest > 0 ? `<td width="${rest}%" style="background-color:${C.track};height:8px;font-size:0;line-height:0;">&nbsp;</td>` : ""}
    </tr>
  </table>`;
}

function oneTakeaway(opts: {
  visitors: number;
  paid: number;
  pricing: number;
  sourceRows: SourceEngagementRow[];
  leaks: { pricing_no_buy: number; buy_no_checkout: number; checkout_no_paid: number };
}): string {
  const { visitors, paid, pricing, sourceRows, leaks } = opts;
  if (!visitors) return "No landing traffic yesterday.";
  if (paid > 0) return `${paid} paid.`;
  if (leaks.buy_no_checkout > 0) return `${leaks.buy_no_checkout} clicked Buy but never opened checkout.`;
  if (leaks.checkout_no_paid > 0) return `${leaks.checkout_no_paid} opened checkout with no purchase.`;
  if (visitors >= 5 && pricing / visitors < 0.35) {
    return `Most people never reached pricing (${pricing}/${visitors}).`;
  }
  const top = [...sourceRows].sort((a, b) => b.visitors - a.visitors)[0];
  if (top?.visitors) return `${bucketLabel(top.ref)} brought the most visitors (${top.visitors}).`;
  return `${visitors} visitors, no purchases.`;
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
    const [dayRaw, stats, sourceEng, leaks] = await Promise.all([
      attributionDaySummary(start, end),
      landingDayStats(start, end),
      landingSourceEngagement(start, end),
      landingFunnelLeaks(start, end),
    ]);
    const dayRows = rollupDay(dayRaw);
    const dayTot = sumDay(dayRows);
    const visitors = Math.max(stats.unique_visitors, dayTot.visits);
    const takeaway = oneTakeaway({
      visitors,
      paid: dayTot.paid,
      pricing: stats.pricing_views,
      sourceRows: sourceEng,
      leaks,
    });

    const funnel = [
      { label: "Visitors", value: visitors, color: "#555555" },
      { label: "Pricing", value: stats.pricing_views, color: "#777777" },
      { label: "Buy click", value: stats.buy_clicks, color: C.warn },
      { label: "Checkout", value: stats.checkout_opens, color: C.warn },
      { label: "Paid", value: dayTot.paid, color: C.good },
    ];
    const funnelMax = Math.max(...funnel.map((s) => s.value), 1);
    const visitMax = Math.max(...dayRows.map((r) => r.visits), 1);

    const funnelRows = funnel
      .map((s, i) => {
        const prev = i === 0 ? s.value : funnel[i - 1]!.value;
        const rate = i === 0 ? "" : ` · ${pctLabel(s.value, prev)}`;
        return `<tr>
          <td style="padding:6px 0 2px;font-size:14px;color:${C.ink}">${escapeHtml(s.label)}</td>
          <td style="padding:6px 0 2px;font-size:14px;color:${C.ink};text-align:right;font-weight:600">${s.value}${escapeHtml(rate)}</td>
        </tr>
        <tr><td colspan="2" style="padding:0 0 8px">${barHtml(s.value, funnelMax, s.color)}</td></tr>`;
      })
      .join("");

    const sourceRowsHtml = dayRows
      .map(
        (r) => `<tr>
        <td style="padding:6px 8px 2px 0;font-size:14px;color:${C.ink}">${escapeHtml(r.label)}</td>
        <td style="padding:6px 0 2px">${barHtml(r.visits, visitMax, r.color)}</td>
        <td style="padding:6px 0 2px 10px;font-size:14px;color:${C.ink};text-align:right;white-space:nowrap">${r.visits}${r.paid ? ` · ${r.paid} paid` : ""}</td>
      </tr>`,
      )
      .join("");

    const subject = `MercerLine · ${label} · ${dayTot.paid} paid · ${visitors} visitors`;

    const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px 16px;background:#ffffff;color:${C.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto">
    <div style="font-size:13px;color:${C.muted}">MercerLine · ${escapeHtml(label)}</div>
    <div style="font-size:20px;font-weight:700;margin:6px 0 4px;color:${C.ink}">${escapeHtml(takeaway)}</div>
    <div style="font-size:13px;color:${C.muted};margin-bottom:20px">${visitors} visitors · ${fmtMs(stats.avg_active_ms)} avg active · ${stats.avg_scroll_pct}% scroll</div>

    <div style="font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px">Funnel</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:22px">${funnelRows}</table>

    <div style="font-size:12px;color:${C.muted};text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px">Sources</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">${sourceRowsHtml}</table>

    <div style="font-size:11px;color:${C.muted};margin-top:24px">${escapeHtml(timeZone)} day · paid after Whop webhook</div>
  </div>
</body>
</html>`;

    const text = [
      `MercerLine · ${label}`,
      takeaway,
      `${visitors} visitors · ${fmtMs(stats.avg_active_ms)} avg active · ${stats.avg_scroll_pct}% scroll`,
      "",
      "FUNNEL",
      ...funnel.map((s) => `${s.label}: ${s.value}`),
      "",
      "SOURCES",
      ...dayRows.map((r) => `${r.label}: ${r.visits} visits${r.paid ? `, ${r.paid} paid` : ""}`),
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
      allTimeRows: 0,
    };
  } catch (err) {
    await releaseAttributionReportClaim(dayKey).catch(() => {});
    throw err;
  }
}
