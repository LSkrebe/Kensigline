import assert from "node:assert/strict";
import { buildAnalyseQuarterWindow, HISTORICAL_QUARTERS, ESTIMATE_QUARTERS, TOTAL_COLUMNS } from "./quarter-window.js";

export function runQuarterWindowTests() {
  const w = buildAnalyseQuarterWindow(new Date("2026-07-07T12:00:00Z"));
  assert.equal(w.length, TOTAL_COLUMNS);
  assert.equal(w.filter((s) => !s.isEstimate).length, HISTORICAL_QUARTERS);
  assert.equal(w.filter((s) => s.isEstimate).length, ESTIMATE_QUARTERS);
  assert.equal(w[0]?.label, "Q1'25");
  assert.equal(w[5]?.label, "Q2'26");
  assert.equal(w[6]?.label, "Q3'26E");
  assert.equal(w[9]?.label, "Q2'27E");

  const q2Window = buildAnalyseQuarterWindow(new Date("2026-04-15T12:00:00Z"));
  assert.equal(q2Window[5]?.label, "Q1'26");
  assert.equal(q2Window[6]?.label, "Q2'26E");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runQuarterWindowTests();
  console.log("[quarter-window] ok");
}
