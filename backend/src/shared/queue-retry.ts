/** Permanent SEC miss — do not retry. */
export function isPermanentQueueError(msg: string): boolean {
  return /sec_fetch_failed 404|fetch_failed 404|permanent_404/i.test(msg);
}

/** Fast retry: network blips, SEC 503 overload, fetch timeouts (not Postgres statement timeout). */
export function isFastRetryQueueError(msg: string): boolean {
  if (isPermanentQueueError(msg)) return false;
  const m = msg.toLowerCase();
  if (m.includes("statement timeout")) return false;
  return (
    /503|502|fetch_failed|fetch failed|sec_fetch_failed|etimedout|econn|network|socket|reclaimed_stale/.test(m) ||
    (/timeout/.test(m) && !m.includes("statement timeout"))
  );
}

/** SEC rate limit / bot block — retry sooner than old minute-scale backoff, not instant (global cooldown). */
export function isSecRateLimitQueueError(msg: string): boolean {
  return /429|sec_blocked|rate_limit/i.test(msg);
}

export type QueueRetryPlan = { delaySec: number; maxAttempts: number; permanent: boolean };

function envNum(key: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** Compute retry delay (seconds) and attempt budget from error + attempt count. */
export function planQueueRetry(attempt: number, msg: string): QueueRetryPlan {
  const n = Math.max(1, attempt);
  if (isPermanentQueueError(msg)) {
    return { delaySec: 0, maxAttempts: n, permanent: true };
  }
  if (isSecRateLimitQueueError(msg)) {
    const base = envNum("QUEUE_429_RETRY_BASE_SEC", 15, 5, 120);
    const cap = envNum("QUEUE_429_RETRY_MAX_SEC", 60, base, 300);
    const maxAttempts = envNum("QUEUE_TRANSIENT_MAX_ATTEMPTS", 12, 6, 24);
    const delaySec = Math.min(cap, base * 2 ** Math.min(3, n - 1));
    return { delaySec, maxAttempts, permanent: false };
  }
  if (isFastRetryQueueError(msg)) {
    const base = envNum("QUEUE_FAST_RETRY_BASE_SEC", 1, 1, 30);
    const cap = envNum("QUEUE_FAST_RETRY_MAX_SEC", 30, base, 120);
    const maxAttempts = envNum("QUEUE_TRANSIENT_MAX_ATTEMPTS", 12, 6, 24);
    const delaySec = Math.min(cap, base * 2 ** Math.min(4, n - 1));
    return { delaySec, maxAttempts, permanent: false };
  }
  const base = envNum("QUEUE_RETRY_BASE_SEC", 5, 1, 60);
  const cap = envNum("QUEUE_RETRY_MAX_SEC", 120, base, 600);
  const maxAttempts = envNum("QUEUE_MAX_ATTEMPTS", 6, 3, 12);
  const delaySec = Math.min(cap, base * 2 ** Math.min(4, n - 1));
  return { delaySec, maxAttempts, permanent: false };
}
