/** Scale walk trickle down as the parse queue fills — 0 at high water, full cap at low water. */
export function computeAdaptiveWalkTrickle(opts: {
  ready: number;
  lowWater: number;
  highWater: number;
  cap?: number;
}): number {
  const cap = Math.max(
    0,
    Math.min(500, opts.cap ?? (Number(process.env.BACKFILL_WALK_TRICKLE ?? 50) || 50)),
  );
  const low = Math.max(0, Math.floor(opts.lowWater));
  const high = Math.max(low + 1, Math.floor(opts.highWater));
  const ready = Math.max(0, Math.floor(opts.ready));

  if (cap <= 0) return 0;
  if (ready <= low) return cap;
  if (ready >= high) return 0;

  // Above low water the queue must drain before we add more work. Only trickle in a
  // narrow band just above low; at prod levels (~5k ready) this is scan-only (0).
  const span = high - low;
  const buffer = Math.max(1, Math.floor(span * 0.15));
  const trickleCeiling = low + buffer;
  if (ready > trickleCeiling) return 0;

  const headroom = trickleCeiling - ready;
  return Math.max(0, Math.min(cap, Math.ceil((cap * headroom) / buffer)));
}

/** When trickle=0, batch-fill queue gaps — never enqueue faster than parse drains. */
export function computeGapFillLimit(opts: {
  ready: number;
  lowWater: number;
  highWater: number;
  drainPerMin?: number;
  /** Backfill ticks per minute (e.g. 6 for 10s interval). */
  ticksPerMin?: number;
  cap?: number;
}): number {
  const cap = Math.max(
    1,
    Math.min(50, opts.cap ?? (Number(process.env.BACKFILL_GAP_FILL_MAX ?? 20) || 20)),
  );
  const high = Math.max(Math.floor(opts.lowWater) + 1, Math.floor(opts.highWater));
  const ready = Math.max(0, Math.floor(opts.ready));

  if (ready >= high) return 0;

  const drain = Number(opts.drainPerMin ?? 0);
  const ticksPerMin = Math.max(1, Number(opts.ticksPerMin ?? 6) || 6);
  if (!Number.isFinite(drain)) return 1;

  // Per-tick budget: ~80% of measured drain so queue trends down, not up.
  const drainBudget =
    drain > 0
      ? Math.max(1, Math.floor((drain / ticksPerMin) * 0.8))
      : drain < -1
        ? 1
        : 2;

  if (drain < 0) return Math.min(drainBudget, 2);
  if (drain < 2) return Math.min(drainBudget, 3);

  return Math.min(cap, drainBudget);
}
