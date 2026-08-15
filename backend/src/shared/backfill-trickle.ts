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

  const headroom = high - ready;
  const span = high - low;
  return Math.max(0, Math.min(cap, Math.ceil((cap * headroom) / span)));
}
