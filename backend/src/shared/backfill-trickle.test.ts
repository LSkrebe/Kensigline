import assert from "node:assert/strict";
import { computeAdaptiveWalkTrickle, computeGapFillLimit } from "./backfill-trickle.js";

export function runBackfillTrickleTests() {
  process.env.BACKFILL_WALK_TRICKLE = "50";
  const low = 1800;
  const high = 7000;

  assert.equal(computeAdaptiveWalkTrickle({ ready: 1000, lowWater: low, highWater: high }), 50);
  assert.equal(computeAdaptiveWalkTrickle({ ready: 1800, lowWater: low, highWater: high }), 50);
  assert.equal(computeAdaptiveWalkTrickle({ ready: 7000, lowWater: low, highWater: high }), 0);
  assert.equal(computeAdaptiveWalkTrickle({ ready: 8000, lowWater: low, highWater: high }), 0);

  // Prod-fat queue: scan-only, no trickle enqueue.
  assert.equal(computeAdaptiveWalkTrickle({ ready: 5500, lowWater: low, highWater: high }), 0);
  assert.equal(computeAdaptiveWalkTrickle({ ready: 4400, lowWater: low, highWater: high }), 0);

  const nearLow = computeAdaptiveWalkTrickle({ ready: 2400, lowWater: low, highWater: high });
  assert.ok(nearLow >= 1 && nearLow <= 20);

  const fat = computeAdaptiveWalkTrickle({ ready: 6500, lowWater: low, highWater: high });
  assert.equal(fat, 0);

  assert.equal(computeGapFillLimit({ ready: 7000, lowWater: low, highWater: high, drainPerMin: 10 }), 0);
  assert.equal(computeGapFillLimit({ ready: 5500, lowWater: low, highWater: high, drainPerMin: -5 }), 1);
  assert.equal(computeGapFillLimit({ ready: 5500, lowWater: low, highWater: high, drainPerMin: 20 }), 19);
  assert.equal(computeGapFillLimit({ ready: 5500, lowWater: low, highWater: high, drainPerMin: 40 }), 25);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBackfillTrickleTests();
  console.log("[backfill-trickle] ok");
}
