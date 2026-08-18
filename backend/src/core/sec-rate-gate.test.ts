import assert from "node:assert/strict";
import {
  acquireSecSlot,
  releaseSecSlot,
  resetSecRateGateForTests,
  secInFlightCount,
  secMaxInFlight,
} from "./sec-rate-gate.js";

export async function runSecRateGateTests() {
  resetSecRateGateForTests();
  process.env.SEC_MAX_RPS = "10";
  process.env.SEC_MIN_INTERVAL_MS = "0";
  process.env.SEC_MAX_IN_FLIGHT = "2";

  await acquireSecSlot();
  await acquireSecSlot();
  assert.equal(secInFlightCount(), 2);

  let thirdStarted = false;
  const third = acquireSecSlot().then(() => {
    thirdStarted = true;
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(thirdStarted, false);

  releaseSecSlot();
  await third;
  assert.equal(thirdStarted, true);
  releaseSecSlot(); // third slot
  releaseSecSlot(); // first slot (second was released earlier)
  assert.equal(secInFlightCount(), 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSecRateGateTests().then(() => console.log("[sec-rate-gate] ok"));
}
