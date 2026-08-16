import assert from "node:assert/strict";
import { computeAdaptiveWalkTrickle, computeGapFillLimit } from "./backfill-trickle.js";

export function runBackfillTrickleTests() {
  process.env.BACKFILL_WALK_TRICKLE = "50";
  const low = 1800;
  const high = 7000;
  const tpm = 6; // 10s backfill interval

  assert.equal(computeAdaptiveWalkTrickle({ ready: 1000, lowWater: low, highWater: high }), 50);
  assert.equal(computeAdaptiveWalkTrickle({ ready: 1800, lowWater: low, highWater: high }), 50);
  assert.equal(computeAdaptiveWalkTrickle({ ready: 7000, lowWater: low, highWater: high }), 0);
  assert.equal(computeAdaptiveWalkTrickle({ ready: 8000, lowWater: low, highWater: high }), 0);

  assert.equal(computeAdaptiveWalkTrickle({ ready: 5500, lowWater: low, highWater: high }), 0);
  assert.equal(computeAdaptiveWalkTrickle({ ready: 4400, lowWater: low, highWater: high }), 0);

  const nearLow = computeAdaptiveWalkTrickle({ ready: 2400, lowWater: low, highWater: high });
  assert.ok(nearLow >= 1 && nearLow <= 20);

  assert.equal(computeGapFillLimit({ ready: 7000, lowWater: low, highWater: high, drainPerMin: 10 }), 0);
  assert.equal(
    computeGapFillLimit({ ready: 5500, lowWater: low, highWater: high, drainPerMin: -5, ticksPerMin: tpm }),
    1,
  );
  assert.equal(
    computeGapFillLimit({ ready: 5500, lowWater: low, highWater: high, drainPerMin: 0, ticksPerMin: tpm }),
    2,
  );
  // drain=30/min → 4/tick × 6 ticks = 24/min (under drain)
  assert.equal(
    computeGapFillLimit({ ready: 5500, lowWater: low, highWater: high, drainPerMin: 30, ticksPerMin: tpm }),
    4,
  );
  // drain=60/min → 8/tick × 6 = 48/min
  assert.equal(
    computeGapFillLimit({ ready: 5500, lowWater: low, highWater: high, drainPerMin: 60, ticksPerMin: tpm }),
    8,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBackfillTrickleTests();
  console.log("[backfill-trickle] ok");
}
