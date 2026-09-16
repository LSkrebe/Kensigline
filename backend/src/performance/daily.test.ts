import test from 'node:test';import assert from 'node:assert/strict';
import {buildDailyDisclosureIndex} from './daily.js';
const market=['2026-09-08','2026-09-09','2026-09-10','2026-09-11'].map(day=>({day,close:100}));
const prices=new Map([['AAA',market.map((b,i)=>({...b,close:[100,110,121,121][i]!}))]]);
test('marks every close without a new transaction and deduplicates repeated trades',()=>{
 const r={ticker:'AAA',action:'buy',baselineDay:'2026-09-08',transactionDate:'2026-09-08'};
 const one=buildDailyDisclosureIndex([r],prices,market),repeated=buildDailyDisclosureIndex([r,r],prices,market);
 assert.equal(one.points.length,4);assert.ok(Math.abs(one.points[2]!.cumulative-.21)<1e-10);assert.deepEqual(one,repeated);
});
test('never attributes performance before entry and never inverts sales',()=>{
 const result=buildDailyDisclosureIndex([{ticker:'AAA',action:'sell',baselineDay:'2026-09-09',transactionDate:'2026-09-09'}],prices,market);
 assert.equal(result.points[0]!.day,'2026-09-09');assert.ok(result.points.at(-1)!.cumulative>0);
});
test('missing closes stop a continuous series rather than invent a flat return',()=>{
 const broken=new Map([['AAA',prices.get('AAA')!.filter(b=>b.day!=='2026-09-10')]]);
 const result=buildDailyDisclosureIndex([{ticker:'AAA',action:'buy',baselineDay:'2026-09-08',transactionDate:'2026-09-08'}],broken,market);
 assert.equal(result.asOf,'2026-09-09');assert.equal(result.missingSessions,1);
});
test('unverified security classes and amendments cannot enter reference basket',()=>{
 assert.equal(buildDailyDisclosureIndex([{ticker:'AAA',action:'buy',reason:'Amendment unresolved'}],prices,market).points.length,0);
});
test('a missing symbol does not freeze other measured daily returns; coverage is counted',()=>{
 const partial=new Map([...prices,['BBB',[market[0]!,market[1]!]]]);
 const result=buildDailyDisclosureIndex(['AAA','BBB'].map(ticker=>({ticker,action:'buy',transactionDate:'2026-09-08',baselineDay:'2026-09-08'})),partial,market);
 assert.equal(result.asOf,'2026-09-11');assert.equal(result.points.at(-1)!.constituents,1);assert.equal(result.missingSessions,2);
});
