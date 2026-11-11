import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countryFromRequestHeaders,
  pricesForTier,
  resolveVisitorPricing,
  tierForCountry,
} from "./ppp.js";

test("tier prices match product table", () => {
  assert.deepEqual(pricesForTier(1), { monthlyUsd: 48.4, yearlyUsd: 484 });
  assert.deepEqual(pricesForTier(2), { monthlyUsd: 37.6, yearlyUsd: 376 });
  assert.deepEqual(pricesForTier(3), { monthlyUsd: 26.4, yearlyUsd: 264 });
  assert.deepEqual(pricesForTier(4), { monthlyUsd: 14.8, yearlyUsd: 148 });
});

test("country map + unknown defaults to tier 1", () => {
  assert.equal(tierForCountry("US"), 1);
  assert.equal(tierForCountry("DE"), 1);
  assert.equal(tierForCountry("PL"), 2);
  assert.equal(tierForCountry("BR"), 3);
  assert.equal(tierForCountry("IN"), 4);
  assert.equal(tierForCountry(null), 1);
  assert.equal(tierForCountry("XX"), 1);
  assert.equal(tierForCountry(""), 1);
});

test("CF-IPCountry header parsing", () => {
  assert.equal(countryFromRequestHeaders({ "cf-ipcountry": "br" }), "BR");
  assert.equal(countryFromRequestHeaders({ "CF-IPCountry": ["in"] }), "IN");
  assert.equal(countryFromRequestHeaders({ "cf-ipcountry": "XX" }), null);
  assert.equal(countryFromRequestHeaders({}), null);
});

test("resolveVisitorPricing rolls up", () => {
  const r = resolveVisitorPricing({ "cf-ipcountry": "IN" });
  assert.equal(r.country, "IN");
  assert.equal(r.tier, 4);
  assert.equal(r.prices.monthlyUsd, 14.8);
});
