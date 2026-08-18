import assert from "node:assert/strict";
import { planQueueRetry, secBanSafeRetryDelaySec } from "./queue-retry.js";

export function runQueueRetryTests() {
  delete process.env.QUEUE_FAST_RETRY_BASE_SEC;
  delete process.env.SEC_RATE_LIMIT_COOLDOWN_MS;

  const p404 = planQueueRetry(1, "sec_fetch_failed 404 https://sec.gov/...");
  assert.equal(p404.permanent, true);

  const p503 = planQueueRetry(1, "sec_fetch_failed 503 https://sec.gov/...");
  assert.equal(p503.delaySec, 1);
  assert.equal(p503.maxAttempts, 12);

  const p503b = planQueueRetry(3, "sec_fetch_failed 503 https://sec.gov/...");
  assert.equal(p503b.delaySec, 4);

  process.env.SEC_RATE_LIMIT_COOLDOWN_MS = "600000";
  const p429 = planQueueRetry(1, "sec_fetch_failed 429 https://sec.gov/...");
  assert.equal(p429.delaySec, 600);
  assert.equal(p429.maxAttempts, 6);

  const p429b = planQueueRetry(2, "sec_fetch_failed 429 https://sec.gov/...");
  assert.equal(p429b.delaySec, 615);

  assert.equal(secBanSafeRetryDelaySec(1), 600);

  const pool = planQueueRetry(2, "The operation was aborted due to timeout");
  assert.equal(pool.delaySec, 2);

  // 429 must not get fast retry path
  const notFast = planQueueRetry(1, "sec_fetch_failed 429 https://sec.gov/...");
  assert.ok(notFast.delaySec >= 600);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQueueRetryTests();
  console.log("[queue-retry] ok");
}
