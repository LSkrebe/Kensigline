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
