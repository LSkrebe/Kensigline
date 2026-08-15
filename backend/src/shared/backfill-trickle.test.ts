import assert from "node:assert/strict";
import { computeAdaptiveWalkTrickle } from "./backfill-trickle.js";

export function runBackfillTrickleTests() {
  process.env.BACKFILL_WALK_TRICKLE = "50";

  assert.equal(computeAdaptiveWalkTrickle({ ready: 1000, lowWater: 1800, highWater: 7000 }), 50);
  assert.equal(computeAdaptiveWalkTrickle({ ready: 1800, lowWater: 1800, highWater: 7000 }), 50);
  assert.equal(computeAdaptiveWalkTrickle({ ready: 7000, lowWater: 1800, highWater: 7000 }), 0);
  assert.equal(computeAdaptiveWalkTrickle({ ready: 8000, lowWater: 1800, highWater: 7000 }), 0);

  const mid = computeAdaptiveWalkTrickle({ ready: 4400, lowWater: 1800, highWater: 7000 });
  assert.ok(mid >= 10 && mid <= 40);

  const fat = computeAdaptiveWalkTrickle({ ready: 6500, lowWater: 1800, highWater: 7000 });
  assert.ok(fat >= 1 && fat <= 10);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBackfillTrickleTests();
  console.log("[backfill-trickle] ok");
}
