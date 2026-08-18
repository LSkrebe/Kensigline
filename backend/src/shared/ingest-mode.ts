/**
 * Ingest operating modes — one knob (INGEST_MODE) drives backfill, drain, catch-up, and live.
 *
 * Modes:
 * - backfill  — initial 365d parallel walk; live hard off
 * - catchup   — short sequential re-run (~30d); live hard off; waiting pipelines still parse backlog
 * - drain     — historical done, chew parse queue; live hard off; max parse
 * - live      — steady state; live enqueue on; parse capped for API headroom
 */
import { backfillMaxAgeDays } from "./ingest-policy.js";

export type IngestMode = "backfill" | "catchup" | "drain" | "live";

function envInt(key: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function envNum(prefix: string, key: string, globalKey: string, fallback: number): number {
  const prefixed = Number(process.env[`${prefix}_${key}`] ?? NaN);
  if (Number.isFinite(prefixed)) return prefixed;
  const global = Number(process.env[globalKey] ?? fallback);
  return Number.isFinite(global) ? global : fallback;
}

const MODE_DEFAULTS: Record<
  IngestMode,
  { lowWater: number; highWater: number; liveLowWater: number }
> = {
  backfill: { lowWater: 300, highWater: 7000, liveLowWater: 1800 },
  catchup: { lowWater: 120, highWater: 900, liveLowWater: 120 },
  drain: { lowWater: 300, highWater: 7000, liveLowWater: 1800 },
  live: { lowWater: 80, highWater: 400, liveLowWater: 80 },
};

export function ingestMode(): IngestMode {
  const raw = String(process.env.INGEST_MODE ?? "").trim().toLowerCase();
  if (raw === "backfill" || raw === "catchup" || raw === "drain" || raw === "live") {
    return raw;
  }
  if (String(process.env.LIVE_ENQUEUE_ENABLED ?? "0").trim() === "1") return "live";
  if (String(process.env.BACKFILL_LIVE_ENQUEUE ?? "0").trim() === "1") return "live";
  const schedule = String(process.env.BACKFILL_SCHEDULE ?? "parallel").trim().toLowerCase();
  if (schedule === "sequential" && backfillMaxAgeDays() <= 45) return "catchup";
  return "backfill";
}

/** Live SEC/RSS enqueue — never implicit during backfill/catchup/drain. */
export function liveEnqueuePermitted(): boolean {
  const mode = ingestMode();
  if (mode !== "live") return false;
  return String(process.env.LIVE_ENQUEUE_ENABLED ?? "1").trim() !== "0";
}

export function backfillWalkEnabled(): boolean {
  const mode = ingestMode();
  if (mode === "drain") return false;
  if (String(process.env.BACKFILL_ENABLED ?? "1").trim() === "0") return false;
  // Live: optional idle gap-fill via SEC daily index (queue low/high water gated in worker).
  if (mode === "live") return String(process.env.LIVE_GAP_FILL_ENABLED ?? "1").trim() !== "0";
  return true;
}

/** In live mode, how far back idle gap-fill may walk (days). */
export function liveGapFillMaxAgeDays(): number {
  return envInt("LIVE_GAP_FILL_DAYS", 14, 3, 30);
}

/** Max parse loops per pipeline in live mode (API pool headroom). */
export function liveParseSlotCap(): number {
  return envInt("LIVE_PARSE_SLOT_MAX", 6, 1, 12);
}

export function liveWorkerPoolMax(): number {
  return envInt("LIVE_DATABASE_WORKER_POOL_MAX", 10, 4, 16);
}

export function liveWorkerQueryConcurrency(): number {
  return envInt("LIVE_WORKER_QUERY_CONCURRENCY", 8, 2, 16);
}

export function liveApiPoolMin(): number {
  return envInt("LIVE_DATABASE_POOL_MIN", 4, 2, 12);
}

/** Parse budget when all historical walks are finished. */
export function drainParseSlotCap(): number {
  return envInt("DRAIN_PARSE_SLOT_MAX", envInt("BACKFILL_PARSE_SLOT_MAX", 20, 1, 24), 1, 24);
}

/** Catch-up sequential run — full budget on the active walker. */
export function catchupParseSlotCap(): number {
  return envInt("CATCHUP_PARSE_SLOT_MAX", envInt("BACKFILL_PARSE_SLOT_MAX", 16, 1, 24), 1, 24);
}

export function effectiveParseSlotMax(): number {
  const mode = ingestMode();
  if (mode === "live") return liveParseSlotCap();
  if (mode === "catchup") return catchupParseSlotCap();
  if (mode === "drain") return drainParseSlotCap();
  return envInt("BACKFILL_PARSE_SLOT_MAX", 20, 1, 24);
}

export function effectiveQueueLowWater(prefix: string): number {
  const mode = ingestMode();
  const d = MODE_DEFAULTS[mode];
  return Math.max(0, Math.floor(envNum(prefix, "BACKFILL_QUEUE_LOW_WATER", "BACKFILL_QUEUE_LOW_WATER", d.lowWater)));
}

export function effectiveQueueHighWater(prefix: string): number {
  const low = effectiveQueueLowWater(prefix);
  const mode = ingestMode();
  const d = MODE_DEFAULTS[mode];
  const raw = envNum(prefix, "BACKFILL_QUEUE_HIGH_WATER", "BACKFILL_QUEUE_HIGH_WATER", d.highWater);
  if (Number.isFinite(raw) && raw > low) return Math.floor(raw);
  return low + (mode === "catchup" ? 400 : 800);
}

/** Gate live enqueue until queue drains below this (live mode only). */
export function liveQueueGateLowWater(prefix: string): number {
  const mode = ingestMode();
  const d = MODE_DEFAULTS[mode];
  return Math.max(
    0,
    Math.floor(envNum(prefix, "LIVE_QUEUE_LOW_WATER", "LIVE_QUEUE_LOW_WATER", d.liveLowWater)),
  );
}

export function liveEnqueueGated(prefix: string): boolean {
  if (ingestMode() !== "live") return true;
  return String(process.env[`${prefix}_ENQUEUE_GATE_LIVE`] ?? process.env.ENQUEUE_GATE_LIVE ?? "1").trim() !== "0";
}

export function ingestModeSummary(): string {
  const mode = ingestMode();
  return `mode=${mode} live=${liveEnqueuePermitted() ? 1 : 0} backfillWalk=${backfillWalkEnabled() ? 1 : 0} parseSlotMax=${effectiveParseSlotMax()}`;
}
