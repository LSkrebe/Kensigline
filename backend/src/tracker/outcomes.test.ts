import test from "node:test";
import assert from "node:assert/strict";
import { analyzeOutcomes, type OutcomeEvent } from "./outcomes.js";
const event: OutcomeEvent = {
  id: "a",
  ticker: "TEST",
  category: "insider",
  action: "buy",
  instrument: "shares",
  reportedAt: "2026-01-01",
  observedAt: "2026-01-10T23:00:00Z",
  sourceUrl: "https://www.sec.gov/a",
};
const bars = Array.from({ length: 200 }, (_, i) => ({
  day: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
  close: 100 + i,
}));
const h = new Map([
  ["TEST", bars],
  ["SPY", bars.map((b) => ({ ...b, close: 100 }))],
]);
test("uses a strictly later close; observation clock cannot see the earlier trade", () => {
  const r = analyzeOutcomes([event], h, {
    clock: "observed",
    horizon: 30,
    action: "buy",
  });
  assert.equal(r.observations[0].entryDate, "2026-01-11");
  assert.equal(r.observations[0].exitDate, "2026-02-10");
  assert.equal(r.curve[0]!.stock, 100);
  assert.equal(r.counts.measured, 1);
});
test("duplicate lots do not overweight one decision", () => {
  const r = analyzeOutcomes([event, { ...event, id: "b" }], h, {
    clock: "reported",
    horizon: 30,
    action: "buy",
  });
  assert.equal(r.counts.measured, 1);
  assert.equal(r.counts.duplicates, 1);
});
test("options and unknown dates cannot produce stock PnL", () => {
  const r = analyzeOutcomes(
    [
      { ...event, instrument: "call" },
      { ...event, reportedAt: null },
    ],
    h,
    { clock: "reported", horizon: 30, action: "buy" },
  );
  assert.equal(r.counts.measured, 0);
  assert.equal(r.stockReturn, null);
  assert.equal(r.counts.unsupported, 2);
});
test("a sale is measured as a stock move, never inverted as short profit", () => {
  const r = analyzeOutcomes([{ ...event, action: "sell" }], h, {
    clock: "reported",
    horizon: 30,
    action: "sell",
  });
  assert.ok(r.stockReturn! > 0);
});
test("unmatured windows and missing benchmark prices are excluded", () => {
  const r = analyzeOutcomes(
    [event],
    new Map([
      ["TEST", bars.slice(0, 20)],
      ["SPY", []],
    ]),
    { clock: "reported", horizon: 30, action: "buy" },
  );
  assert.equal(r.counts.notMature, 1);
  assert.equal(r.stockReturn, null);
});
