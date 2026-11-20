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
  { key: "yt", label: "YouTube", refs: new Set(["yt"]) },
  { key: "ig", label: "Instagram", refs: new Set(["ig"]) },
  { key: "twt", label: "Twitter / X", refs: new Set(["twt"]) },
  { key: "other", label: "Other", refs: null as Set<string> | null },
] as const;

type ReportBucketKey = (typeof REPORT_BUCKETS)[number]["key"];

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

type DayBucketRow = { label: string; visits: number; signups: number; checkouts: number; paid: number };
type AllBucketRow = DayBucketRow;

function rollupDay(rows: AttributionDayRow[]): DayBucketRow[] {
  const map = new Map<ReportBucketKey, DayBucketRow>();
  for (const b of REPORT_BUCKETS) {
    map.set(b.key, { label: b.label, visits: 0, signups: 0, checkouts: 0, paid: 0 });
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

function rollupAll(rows: AttributionSummaryRow[]): AllBucketRow[] {
  const map = new Map<ReportBucketKey, AllBucketRow>();
  for (const b of REPORT_BUCKETS) {
    map.set(b.key, { label: b.label, visits: 0, signups: 0, checkouts: 0, paid: 0 });
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
  return `${m}m ${s}s`;
}

function pct(num: number, den: number): string {
  if (!den) return "—";
  return `${((100 * num) / den).toFixed(den < 20 ? 0 : 1)}%`;
}

function rate(num: number, den: number): string {
  if (!den) return "0 / 0";
  return `${num} / ${den} (${pct(num, den)})`;
}

function sourceTableHtml(rows: DayBucketRow[], includePaid: boolean): string {
  const body = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(r.label)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.visits}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.signups}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.checkouts}</td>
          ${includePaid ? `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.paid}</td>` : ""}
        </tr>`,
    )
    .join("");
  const t = sumDay(rows);
  return `<table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px">
    <thead>
      <tr style="text-align:left;background:#f6f6f6">
        <th style="padding:6px 10px">Source</th>
        <th style="padding:6px 10px;text-align:right">Visits</th>
        <th style="padding:6px 10px;text-align:right">Signups</th>
        <th style="padding:6px 10px;text-align:right">Checkouts</th>
        ${includePaid ? `<th style="padding:6px 10px;text-align:right">Paid</th>` : ""}
      </tr>
    </thead>
    <tbody>${body}</tbody>
    <tfoot>
      <tr style="font-weight:600">
        <td style="padding:8px 10px">Total</td>
        <td style="padding:8px 10px;text-align:right">${t.visits}</td>
        <td style="padding:8px 10px;text-align:right">${t.signups}</td>
        <td style="padding:8px 10px;text-align:right">${t.checkouts}</td>
        ${includePaid ? `<td style="padding:8px 10px;text-align:right">${t.paid}</td>` : ""}
      </tr>
    </tfoot>
  </table>`;
}

function engagementBySourceHtml(rows: SourceEngagementRow[]): string {
  if (!rows.length) {
    return `<p style="font-size:14px;color:#555">No session data for this day.</p>`;
  }
  const rolled = new Map<ReportBucketKey, { label: string; visitors: number; sessions: number; activeSum: number; activeN: number; pricing: number; buys: number }>();
  for (const b of REPORT_BUCKETS) {
    rolled.set(b.key, { label: b.label, visitors: 0, sessions: 0, activeSum: 0, activeN: 0, pricing: 0, buys: 0 });
  }
  for (const r of rows) {
    const bucket = rolled.get(bucketKeyForRef(r.ref))!;
    bucket.visitors += r.visitors;
    bucket.sessions += r.sessions;
    bucket.activeSum += r.avg_active_ms * r.sessions;
    bucket.activeN += r.sessions;
    bucket.pricing += r.pricing_views;
    bucket.buys += r.buy_clicks;
  }
  const body = REPORT_BUCKETS.map((b) => {
    const r = rolled.get(b.key)!;
    const avg = r.activeN ? Math.round(r.activeSum / r.activeN) : 0;
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(r.label)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.visitors}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.sessions}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${fmtMs(avg)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.pricing}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.buys}</td>
    </tr>`;
  }).join("");
  return `<table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px">
    <thead>
      <tr style="text-align:left;background:#f6f6f6">
        <th style="padding:6px 10px">Source</th>
        <th style="padding:6px 10px;text-align:right">Visitors</th>
        <th style="padding:6px 10px;text-align:right">Sessions</th>
        <th style="padding:6px 10px;text-align:right">Avg active</th>
        <th style="padding:6px 10px;text-align:right">Pricing</th>
        <th style="padding:6px 10px;text-align:right">Buy clicks</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
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
  const small = stats.unique_visitors > 0 && stats.unique_visitors < 20;

  if (stats.unique_visitors === 0 && stats.sessions === 0 && opts.dayVisits === 0) {
    lines.push("No landing traffic yesterday.");
    return lines;
  }

  if (small) {
    lines.push(`Small sample (${stats.unique_visitors} unique visitors) — treat rates as directional only.`);
  }

  if (sourceRows.length) {
    const top = [...sourceRows].sort((a, b) => b.visitors - a.visitors)[0];
    if (top?.visitors) {
      lines.push(`${bucketLabel(top.ref)} brought the most visitors (${top.visitors}).`);
    }
    const withSessions = sourceRows.filter((r) => r.sessions >= 3);
    if (withSessions.length) {
      const engaged = [...withSessions].sort((a, b) => b.avg_active_ms - a.avg_active_ms)[0];
      if (engaged) {
        lines.push(
          `${bucketLabel(engaged.ref)} had the highest average active time (${fmtMs(engaged.avg_active_ms)}).`,
        );
      }
    }
  }

  if (stats.unique_visitors >= 5) {
    const pricingRate = stats.pricing_views / stats.unique_visitors;
    if (pricingRate < 0.35) {
      lines.push(`Most visitors never reached pricing (${stats.pricing_views} of ${stats.unique_visitors}).`);
    }
    if (stats.pricing_views >= 3 && stats.buy_clicks === 0) {
      lines.push("Visitors reached pricing but nobody clicked Buy.");
    }
  }

  if (leaks.buy_no_checkout > 0) {
    lines.push(`${leaks.buy_no_checkout} visitor(s) clicked Buy but checkout did not open.`);
  }
  if (leaks.checkout_no_paid > 0 && dayPaid === 0) {
    lines.push(`${leaks.checkout_no_paid} visitor(s) opened checkout with no confirmed purchase.`);
  }
  if (dayPaid > 0) {
    lines.push(`${dayPaid} confirmed purchase(s) attributed yesterday.`);
  }

  if (sections.length >= 2) {
    const most = sections[0];
    const least = sections[sections.length - 1];
    if (most && least && most.section !== least.section) {
      lines.push(`Most viewed section: ${most.section} (${most.viewers}). Least: ${least.section} (${least.viewers}).`);
    }
  }

  return lines;
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
    const insights = buildInsights({
      stats,
      dayPaid: dayTot.paid,
      dayVisits: dayTot.visits,
      sourceRows: sourceEng,
      sections,
      leaks,
    });

    const subject = `MercerLine — Daily Analytics ${label}`;
    const links = [
      "https://mercerline.com/yt",
      "https://mercerline.com/ig",
      "https://mercerline.com/twt",
    ].join(" · ");

    const funnelVisitors = Math.max(stats.unique_visitors, dayTot.visits);
    const sectionLines = sections.length
      ? sections
          .slice(0, 8)
          .map((s) => `${s.section}: ${s.viewers}`)
          .join(" · ")
      : "none yet";

    const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111;line-height:1.45;padding:20px">
  <h1 style="font-size:18px;margin:0 0 4px">MercerLine — Daily Analytics Report</h1>
  <p style="margin:0 0 16px;color:#555;font-size:13px">Day ${escapeHtml(label)} · ${escapeHtml(timeZone)} calendar day · short links → YouTube / Instagram / Twitter / Other</p>

  <h2 style="font-size:15px;margin:0 0 8px">1. Overview</h2>
  <ul style="margin:0 0 16px;padding-left:18px;font-size:14px">
    <li>Unique visitors: <strong>${stats.unique_visitors}</strong></li>
    <li>Sessions: <strong>${stats.sessions}</strong> · Returning visitors: <strong>${stats.returning_visitors}</strong></li>
    <li>Avg active time: <strong>${fmtMs(stats.avg_active_ms)}</strong> · Avg session: <strong>${fmtMs(stats.avg_duration_ms)}</strong></li>
    <li>Avg max scroll: <strong>${stats.avg_scroll_pct}%</strong></li>
    <li>Referral visits (legacy): <strong>${dayTot.visits}</strong> · Signups: <strong>${dayTot.signups}</strong> · Paid: <strong>${dayTot.paid}</strong></li>
  </ul>

  <h2 style="font-size:15px;margin:0 0 8px">2. Traffic sources</h2>
  <p style="margin:0 0 6px;font-size:13px;color:#555">Referral funnel (visit / signup / checkout / paid)</p>
  ${sourceTableHtml(dayRows, true)}
  <p style="margin:14px 0 6px;font-size:13px;color:#555">Session engagement by source</p>
  ${engagementBySourceHtml(sourceEng)}

  <h2 style="font-size:15px;margin:20px 0 8px">3. Conversion funnel</h2>
  <ol style="margin:0 0 8px;padding-left:18px;font-size:14px">
    <li>Unique visitors: <strong>${funnelVisitors}</strong></li>
    <li>Pricing viewed: <strong>${rate(stats.pricing_views, funnelVisitors)}</strong></li>
    <li>Buy clicked: <strong>${rate(stats.buy_clicks, stats.pricing_views || funnelVisitors)}</strong></li>
    <li>Checkout opened: <strong>${rate(stats.checkout_opens, stats.buy_clicks || stats.pricing_views || funnelVisitors)}</strong></li>
    <li>Confirmed paid: <strong>${rate(dayTot.paid, stats.checkout_opens || funnelVisitors)}</strong></li>
  </ol>
  <p style="margin:0 0 16px;font-size:13px;color:#555">Leaks — pricing no buy: ${leaks.pricing_no_buy} · buy no checkout: ${leaks.buy_no_checkout} · checkout no paid: ${leaks.checkout_no_paid}</p>

  <h2 style="font-size:15px;margin:0 0 8px">4. Engagement</h2>
  <ul style="margin:0 0 16px;padding-left:18px;font-size:14px">
    <li>Scroll reach (sessions): 25% ${stats.scroll_25} · 50% ${stats.scroll_50} · 75% ${stats.scroll_75} · 90% ${stats.scroll_90} · 100% ${stats.scroll_100}</li>
    <li>Sections: ${escapeHtml(sectionLines)}</li>
  </ul>

  <h2 style="font-size:15px;margin:0 0 8px">5. Insights</h2>
  <ul style="margin:0 0 16px;padding-left:18px;font-size:14px">
    ${insights.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
  </ul>

  <h2 style="font-size:15px;margin:0 0 8px">All time (referral funnel)</h2>
  ${sourceTableHtml(allRows, true)}
  <p style="margin:20px 0 0;font-size:12px;color:#777">Tracked links: ${escapeHtml(links)} · purchases only count after verified Whop webhook · one email per ${escapeHtml(timeZone)} day</p>
</body></html>`;

    const text = [
      `MercerLine — Daily Analytics Report — ${label} (${timeZone})`,
      "",
      "1. OVERVIEW",
      `Unique visitors: ${stats.unique_visitors}`,
      `Sessions: ${stats.sessions} · Returning: ${stats.returning_visitors}`,
      `Avg active: ${fmtMs(stats.avg_active_ms)} · Avg session: ${fmtMs(stats.avg_duration_ms)} · Avg scroll: ${stats.avg_scroll_pct}%`,
      `Referral visits: ${dayTot.visits} · Signups: ${dayTot.signups} · Paid: ${dayTot.paid}`,
      "",
      "2. TRAFFIC SOURCES (referral)",
      ...dayRows.map((r) => `${r.label}: visits ${r.visits}, signups ${r.signups}, checkouts ${r.checkouts}, paid ${r.paid}`),
      "",
      "3. FUNNEL",
      `Visitors ${funnelVisitors} → pricing ${stats.pricing_views} → buy ${stats.buy_clicks} → checkout ${stats.checkout_opens} → paid ${dayTot.paid}`,
      `Leaks: pricing_no_buy=${leaks.pricing_no_buy} buy_no_checkout=${leaks.buy_no_checkout} checkout_no_paid=${leaks.checkout_no_paid}`,
      "",
      "4. ENGAGEMENT",
      `Scroll 25/50/75/90/100: ${stats.scroll_25}/${stats.scroll_50}/${stats.scroll_75}/${stats.scroll_90}/${stats.scroll_100}`,
      `Sections: ${sectionLines}`,
      "",
      "5. INSIGHTS",
      ...insights.map((l) => `- ${l}`),
      "",
      `Tracked links: ${links}`,
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
