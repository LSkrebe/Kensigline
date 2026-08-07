import { db } from "../core/db.js";
import type { ResearchBusinessDriver } from "../documents/extract.js";

export type AggregatedDriver = {
  label: string;
  driverKind: string;
  rollsUpToRevenue: boolean;
  /** Latest disclosed value in USD millions (revenue drivers) or raw units. */
  latestValue: number | null;
  readOnly: boolean;
};

const DRIVER_SOURCE_KEYS = [
  "Earnings transcript",
  "8-K",
  "Press release",
  "10-Q",
  "10-K",
  "Investor presentation",
];

function normalizeDriverKind(raw: unknown): string {
  const k = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (k === "revenue" || k === "segment") return "revenue";
  if (k === "units" || k === "volume") return "units";
  if (k === "enrollment") return "enrollment";
  if (k === "pos_pct" || k === "market_share") return "pos_pct";
  return k || "other";
}

function rollsUpToRevenue(kind: string, explicit: boolean | undefined): boolean {
  if (explicit === false) return false;
  if (explicit === true) return true;
  return kind === "revenue" || kind === "segment";
}

function parseDriverFromRaw(raw: unknown): ResearchBusinessDriver | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const label = String(r.label ?? "").trim();
  if (label.length < 2 || label.length > 80) return null;

  const driverKind = normalizeDriverKind(r.driver_kind ?? r.driverKind);
  const valueUsd =
    r.value_usd_millions != null
      ? Number(r.value_usd_millions)
      : r.valueUsdMillions != null
        ? Number(r.valueUsdMillions)
        : null;
  const value = r.value != null ? Number(r.value) : null;

  return {
    label,
    driver_kind: driverKind,
    ...(r.rolls_up_to_revenue === false || r.rollsUpToRevenue === false ? { rolls_up_to_revenue: false } : {}),
    value_usd_millions: Number.isFinite(valueUsd as number) ? (valueUsd as number) : null,
    value: Number.isFinite(value as number) ? (value as number) : null,
    unit: r.unit != null ? String(r.unit) : null,
    period: r.period != null ? String(r.period) : null,
  };
}

export async function aggregateBusinessDriversFromDocuments(ticker: string): Promise<AggregatedDriver[]> {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) return [];

  const rows = await db.query<{ data: unknown }>(
    `
    SELECT data
    FROM documents
    WHERE ticker_norm = $1
      AND feed_kind = 'research'
      AND show_on_ticker IS NOT FALSE
    ORDER BY COALESCE(feed_at, event_at) DESC NULLS LAST, parsed_at DESC
    LIMIT 40
    `,
    [t],
  );

  const byLabel = new Map<string, AggregatedDriver>();

  for (const row of rows) {
    const data = row.data as { business_drivers?: unknown } | null;
    const drivers = Array.isArray(data?.business_drivers) ? data!.business_drivers : [];
    for (const raw of drivers) {
      const d = parseDriverFromRaw(raw);
      if (!d) continue;
      const key = d.label.toLowerCase();
      if (byLabel.has(key)) continue;

      const driverKind = normalizeDriverKind(d.driver_kind);
      const latestValue =
        driverKind === "revenue" || driverKind === "segment"
          ? d.value_usd_millions ?? d.value
          : d.value ?? d.value_usd_millions;

      byLabel.set(key, {
        label: d.label,
        driverKind,
        rollsUpToRevenue: rollsUpToRevenue(driverKind, d.rolls_up_to_revenue),
        latestValue: latestValue != null && Number.isFinite(latestValue) ? latestValue : null,
        readOnly: driverKind === "enrollment" || driverKind === "pos_pct",
      });
    }
  }

  return Array.from(byLabel.values()).slice(0, 8);
}

/** Prefer earnings-related documents when scanning analysis text for segment hints. */
export async function hasDocumentDriverExtractions(ticker: string): Promise<boolean> {
  const drivers = await aggregateBusinessDriversFromDocuments(ticker);
  return drivers.length > 0;
}

export { DRIVER_SOURCE_KEYS };
