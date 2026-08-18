/** Permanent SEC miss — do not retry. */
export function isPermanentQueueError(msg: string): boolean {
  return /sec_fetch_failed 404|fetch_failed 404|permanent_404/i.test(msg);
}

/**
 * SEC 429 / bot / undeclared-tool — must match SEC client cool-down (SEC_RATE_LIMIT_COOLDOWN_MS).
 * Never fast-retry these; hammering after a 429 risks a longer ban.
 */
export function isSecBanRiskQueueError(msg: string): boolean {
  return /429|sec_blocked|undeclared_automated|sec_fetch_failed 403|rate_limit|http_403/i.test(msg);
}

/** Fast retry: SEC 503 overload, network blips, fetch timeouts (not Postgres statement timeout). */
export function isFastRetryQueueError(msg: string): boolean {
  if (isPermanentQueueError(msg) || isSecBanRiskQueueError(msg)) return false;
  const m = msg.toLowerCase();
  if (m.includes("statement timeout")) return false;
  return (
    /sec_fetch_failed 503|sec_fetch_failed 502|fetch_failed 503|fetch_failed 502/.test(m) ||
    /etimedout|econn|network|socket|reclaimed_stale/.test(m) ||
    (/timeout/.test(m) && !m.includes("statement timeout"))
  );
}

/** @deprecated use isSecBanRiskQueueError */
export function isSecRateLimitQueueError(msg: string): boolean {
  return isSecBanRiskQueueError(msg);
}

export type QueueRetryPlan = { delaySec: number; maxAttempts: number; permanent: boolean };

function envNum(key: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[key] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** Same default as sec.ts secRateLimitCooldownMs — keep queue retry aligned with client pause. */
export function secBanSafeRetryDelaySec(attempt: number): number {
  const raw = Number(process.env.SEC_RATE_LIMIT_COOLDOWN_MS ?? process.env.SEC_BLOCK_MS ?? 600_000);
  const ms = Math.max(30_000, Math.min(900_000, Number.isFinite(raw) ? raw : 600_000));
  const cooldownSec = Math.ceil(ms / 1000);
  // Small jitter so a batch of 429s don't retry in the same second when cooldown lifts.
  const jitter = Math.min(120, Math.max(0, attempt - 1) * 15);
  return cooldownSec + jitter;
}

/** Compute retry delay (seconds) and attempt budget from error + attempt count. */
export function planQueueRetry(attempt: number, msg: string): QueueRetryPlan {
  const n = Math.max(1, attempt);
  if (isPermanentQueueError(msg)) {
    return { delaySec: 0, maxAttempts: n, permanent: true };
  }
  if (isSecBanRiskQueueError(msg)) {
    const maxAttempts = envNum("QUEUE_429_MAX_ATTEMPTS", 6, 3, 12);
    return { delaySec: secBanSafeRetryDelaySec(n), maxAttempts, permanent: false };
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
