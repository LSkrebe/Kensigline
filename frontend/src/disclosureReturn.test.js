import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateDisclosureReturn as calc} from './disclosureReturn.js';
const rows=[{day:'2026-09-04',close:80},{day:'2026-09-08',close:100},{day:'2026-09-09',close:110}];
test('uses first close strictly after filing, excluding same-day look-ahead',()=>{
 const r=calc(rows,'2026-09-04','2026-09-09');
 assert.equal(r.baselineClose,100); assert.equal(r.baselineDay,'2026-09-08');
 assert.ok(Math.abs(r.returnFraction-.1)<1e-10);
});
test('a split-adjusted series gives zero return across a 2:1 split',()=>{
 const r=calc([{day:'2026-09-08',close:50},{day:'2026-09-09',close:50}],'2026-09-07','2026-09-09');
 assert.equal(r.returnFraction,0);
});
test('rejects stale, invalid, conflicting, missing, and future data',()=>{
 assert.equal(calc(rows,'2026-08-01','2026-09-09'),null);
 assert.equal(calc(rows,'2026-09-04','2026-10-09'),null);
 assert.equal(calc(rows,'2026-02-31','2026-09-09'),null);
 assert.equal(calc(rows,'2026-09-10','2026-09-09'),null);
 assert.equal(calc([...rows,{day:'2026-09-09',close:99}],'2026-09-04','2026-09-09'),null);
 assert.equal(calc([{day:'2026-09-08',close:null},{day:'2026-09-09',close:110}],'2026-09-04','2026-09-09'),null);
});
test('does not turn sales, lots or transaction amounts into a personal return',()=>{
 const r=calc(rows,'2026-09-04','2026-09-09');
 assert.equal(r.points[0].cumulative,0);
 assert.equal('pnl' in r,false);
});
