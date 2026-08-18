import assert from "node:assert/strict";
import { planQueueRetry } from "./queue-retry.js";

export function runQueueRetryTests() {
  delete process.env.QUEUE_FAST_RETRY_BASE_SEC;
  delete process.env.QUEUE_429_RETRY_BASE_SEC;

  const p404 = planQueueRetry(1, "sec_fetch_failed 404 https://sec.gov/...");
  assert.equal(p404.permanent, true);

  const p503 = planQueueRetry(1, "sec_fetch_failed 503 https://sec.gov/...");
  assert.equal(p503.delaySec, 1);
  assert.equal(p503.maxAttempts, 12);

  const p503b = planQueueRetry(3, "sec_fetch_failed 503 https://sec.gov/...");
  assert.equal(p503b.delaySec, 4);

  const p429 = planQueueRetry(1, "sec_fetch_failed 429 https://sec.gov/...");
  assert.equal(p429.delaySec, 15);
  assert.ok(p429.maxAttempts >= 6);

  const pool = planQueueRetry(2, "The operation was aborted due to timeout");
  assert.equal(pool.delaySec, 2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQueueRetryTests();
  console.log("[queue-retry] ok");
}
