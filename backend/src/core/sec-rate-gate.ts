/**
 * Process-wide SEC request budget — one cap for all parse/enqueue/backfill workers.
 * SEC fair access: ~10 req/s total; we also cap concurrent in-flight fetches so
 * parallel workers cannot open hundreds of connections while "respecting" RPS.
 */

let secBlockedUntil = 0;
let secInFlight = 0;
let lastStartAt = 0;
const recentStarts: number[] = [];

function envInt(key: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function secMaxRps(): number {
  // Default 9 — headroom under SEC's published 10 req/s fair-access cap.
  return envInt("SEC_MAX_RPS", 9, 1, 10);
}

export function secMinIntervalMs(): number {
  return envInt("SEC_MIN_INTERVAL_MS", 0, 0, 2000);
}

/** Even spacing so we don't burst 10 requests in 200ms then go idle. */
export function secEffectiveMinIntervalMs(maxRps: number): number {
  const configured = secMinIntervalMs();
  const evenPace = Math.max(1, Math.ceil(1000 / Math.max(1, maxRps)));
  return Math.max(configured, evenPace);
}

export function secMaxInFlight(): number {
  return envInt("SEC_MAX_IN_FLIGHT", 8, 1, 10);
}

export function armSecBlockedUntil(untilMs: number): void {
  secBlockedUntil = Math.max(secBlockedUntil, untilMs);
  recentStarts.length = 0;
}

export function secCooldownRemainingMs(): number {
  return Math.max(0, secBlockedUntil - Date.now());
}

function pruneRecentStarts(now: number): void {
  const cutoff = now - 1000;
  while (recentStarts.length && (recentStarts[0] ?? 0) <= cutoff) recentStarts.shift();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

/** Wait until a global slot is available; call releaseSecSlot() in finally after fetch. */
export async function acquireSecSlot(): Promise<void> {
  for (;;) {
    const blocked = secBlockedUntil - Date.now();
    if (blocked > 0) {
      await sleep(blocked);
      continue;
    }

    const now = Date.now();
    pruneRecentStarts(now);
    const maxRps = secMaxRps();
    const maxInFlight = secMaxInFlight();
    const minMs = secEffectiveMinIntervalMs(maxRps);

    if (secInFlight >= maxInFlight) {
      await sleep(20);
      continue;
    }
    if (recentStarts.length >= maxRps) {
      const wait = (recentStarts[0] ?? now) + 1000 - now;
      await sleep(wait);
      continue;
    }
    if (lastStartAt > 0 && minMs > 0 && now - lastStartAt < minMs) {
      await sleep(minMs - (now - lastStartAt));
      continue;
    }

    const at = Date.now();
    secInFlight += 1;
    lastStartAt = at;
    recentStarts.push(at);
    return;
  }
}

export function releaseSecSlot(): void {
  secInFlight = Math.max(0, secInFlight - 1);
}

/** @internal test hooks */
export function resetSecRateGateForTests(): void {
  secBlockedUntil = 0;
  secInFlight = 0;
  lastStartAt = 0;
  recentStarts.length = 0;
}

export function secInFlightCount(): number {
  return secInFlight;
}
