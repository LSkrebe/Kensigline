import { sendResendEmail } from "../alerts/resend.js";
import { attributionDaySummary, attributionSummary, type AttributionDayRow, type AttributionSummaryRow } from "./store.js";

/** Fixed email buckets — always four rows. */
const REPORT_BUCKETS = [
  { key: "yt", label: "YouTube", refs: new Set(["yt"]) },
  { key: "ig", label: "Instagram", refs: new Set(["ig"]) },
  { key: "twt", label: "Twitter", refs: new Set(["twt"]) },
  { key: "other", label: "Other", refs: null as Set<string> | null },
] as const;

type ReportBucketKey = (typeof REPORT_BUCKETS)[number]["key"];

export function attributionReportRecipient(): string {
  return String(process.env.ATTRIBUTION_REPORT_TO ?? "lukas.skrebe@gmail.com").trim() || "lukas.skrebe@gmail.com";
}

export function attributionReportEnabled(): boolean {
  return String(process.env.ATTRIBUTION_REPORT_ENABLED ?? "1").trim() !== "0";
}

/** Previous calendar day in UTC: [start, end). */
export function previousUtcDayWindow(now = new Date()): { start: Date; end: Date; label: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const label = start.toISOString().slice(0, 10);
  return { start, end, label };
}

function bucketKeyForRef(ref: string): ReportBucketKey {
  const r = String(ref ?? "").trim().toLowerCase();
  for (const b of REPORT_BUCKETS) {
    if (b.refs?.has(r)) return b.key;
  }
  return "other";
}

type DayBucketRow = { label: string; visits: number; signups: number; checkouts: number };
type AllBucketRow = DayBucketRow & { paid: number };

function rollupDay(rows: AttributionDayRow[]): DayBucketRow[] {
  const map = new Map<ReportBucketKey, DayBucketRow>();
  for (const b of REPORT_BUCKETS) {
    map.set(b.key, { label: b.label, visits: 0, signups: 0, checkouts: 0 });
  }
  for (const r of rows) {
    const row = map.get(bucketKeyForRef(r.ref))!;
    row.visits += r.visits;
    row.signups += r.signups;
    row.checkouts += r.checkouts;
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
      return acc;
    },
    { visits: 0, signups: 0, checkouts: 0 },
  );
}

function sumAll(rows: AllBucketRow[]) {
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

function dayTableHtml(rows: DayBucketRow[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(r.label)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.visits}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.signups}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.checkouts}</td>
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
      </tr>
    </thead>
    <tbody>${body}</tbody>
    <tfoot>
      <tr style="font-weight:600">
        <td style="padding:8px 10px">Total</td>
        <td style="padding:8px 10px;text-align:right">${t.visits}</td>
        <td style="padding:8px 10px;text-align:right">${t.signups}</td>
        <td style="padding:8px 10px;text-align:right">${t.checkouts}</td>
      </tr>
    </tfoot>
  </table>`;
}

function allTimeTableHtml(rows: AllBucketRow[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(r.label)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.visits}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.signups}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.checkouts}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${r.paid}</td>
        </tr>`,
    )
    .join("");
  const t = sumAll(rows);
  return `<table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px">
    <thead>
      <tr style="text-align:left;background:#f6f6f6">
        <th style="padding:6px 10px">Source</th>
        <th style="padding:6px 10px;text-align:right">Visits</th>
        <th style="padding:6px 10px;text-align:right">Signups</th>
        <th style="padding:6px 10px;text-align:right">Checkouts</th>
        <th style="padding:6px 10px;text-align:right">Paid</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
    <tfoot>
      <tr style="font-weight:600">
        <td style="padding:8px 10px">Total</td>
        <td style="padding:8px 10px;text-align:right">${t.visits}</td>
        <td style="padding:8px 10px;text-align:right">${t.signups}</td>
        <td style="padding:8px 10px;text-align:right">${t.checkouts}</td>
        <td style="padding:8px 10px;text-align:right">${t.paid}</td>
      </tr>
    </tfoot>
  </table>`;
}

function dayTableText(rows: DayBucketRow[]): string {
  const lines = ["Source | Visits | Signups | Checkouts", "-------|--------|---------|----------"];
  for (const r of rows) {
    lines.push(`${r.label} | ${r.visits} | ${r.signups} | ${r.checkouts}`);
  }
  const t = sumDay(rows);
  lines.push(`Total | ${t.visits} | ${t.signups} | ${t.checkouts}`);
  return `${lines.join("\n")}\n`;
}

function allTimeTableText(rows: AllBucketRow[]): string {
  const lines = ["Source | Visits | Signups | Checkouts | Paid", "-------|--------|---------|-----------|-----"];
  for (const r of rows) {
    lines.push(`${r.label} | ${r.visits} | ${r.signups} | ${r.checkouts} | ${r.paid}`);
  }
  const t = sumAll(rows);
  lines.push(`Total | ${t.visits} | ${t.signups} | ${t.checkouts} | ${t.paid}`);
  return `${lines.join("\n")}\n`;
}

export type AttributionDailyReportResult =
  | { ok: true; day: string; to: string; id: string; dayRows: number; allTimeRows: number }
  | { ok: false; reason: string };

export async function runAttributionDailyReport(opts?: {
  to?: string;
  now?: Date;
}): Promise<AttributionDailyReportResult> {
  if (!attributionReportEnabled() && !opts?.to) {
    return { ok: false, reason: "disabled" };
  }

  const { start, end, label } = previousUtcDayWindow(opts?.now);
  const to = String(opts?.to ?? attributionReportRecipient()).trim();
  if (!to) return { ok: false, reason: "no_recipient" };

  const [dayRaw, allRaw] = await Promise.all([
    attributionDaySummary(start, end),
    attributionSummary(),
  ]);
  const dayRows = rollupDay(dayRaw);
  const allRows = rollupAll(allRaw);

  const subject = `Mercerline attribution ${label} (UTC)`;
  const links = [
    "https://mercerline.com/yt",
    "https://mercerline.com/ig",
    "https://mercerline.com/twt",
  ].join(" · ");

  const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111;line-height:1.45;padding:20px">
  <h1 style="font-size:18px;margin:0 0 4px">Mercerline attribution</h1>
  <p style="margin:0 0 16px;color:#555;font-size:13px">Day ${escapeHtml(label)} · UTC 00:00–24:00 · YouTube / Instagram / Twitter / Other</p>
  <h2 style="font-size:15px;margin:0 0 8px">Yesterday</h2>
  ${dayTableHtml(dayRows)}
  <h2 style="font-size:15px;margin:20px 0 8px">All time</h2>
  ${allTimeTableHtml(allRows)}
  <p style="margin:20px 0 0;font-size:12px;color:#777">Tracked links: ${escapeHtml(links)} · everything else → Other</p>
</body></html>`;

  const text = [
    `Mercerline attribution — ${label} (UTC)`,
    "",
    "YESTERDAY",
    dayTableText(dayRows),
    "ALL TIME",
    allTimeTableText(allRows),
    `Tracked links: ${links} · everything else → Other`,
  ].join("\n");

  const sent = await sendResendEmail({ to, subject, html, text });
  if (!sent.ok) {
    return { ok: false, reason: sent.error };
  }

  return {
    ok: true,
    day: label,
    to,
    id: sent.id,
    dayRows: dayRows.length,
    allTimeRows: allRows.length,
  };
}
