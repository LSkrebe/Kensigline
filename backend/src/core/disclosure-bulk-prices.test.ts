import test from 'node:test';import assert from 'node:assert/strict';
import {mergeDailyCloses} from '../performance/daily-price.js';import {completedDay} from '../performance/calendar.js';
test('daily close is due after 18:00 New York and skips holidays/weekends',()=>{
 assert.equal(completedDay(new Date('2026-09-14T21:59:00Z')),'2026-09-11');
 assert.equal(completedDay(new Date('2026-09-14T22:00:00Z')),'2026-09-14');
 assert.equal(completedDay(new Date('2026-09-07T23:00:00Z')),'2026-09-04');
});
test('new split rebases the whole stored series but preserves reported-price basis',()=>{
 const bars=mergeDailyCloses([{day:'2026-09-09',close:200,unadjustedClose:200},{day:'2026-09-10',close:220,unadjustedClose:220}],{day:'2026-09-10',close:110,unadjustedClose:220},{day:'2026-09-11',close:121,unadjustedClose:121})!;
 assert.deepEqual(bars.map(b=>b.close),[100,110,121]);assert.equal(bars[0]!.unadjustedClose,200);
});
test('missing overlap never splices incompatible histories',()=>{
 assert.equal(mergeDailyCloses([{day:'2026-09-01',close:100}],{day:'2026-09-10',close:200},{day:'2026-09-11',close:210}),null);
});
test('an ordinary corrected close is not mistaken for a stock split',()=>{
 const bars=mergeDailyCloses([{day:'2026-09-09',close:100,unadjustedClose:100},{day:'2026-09-10',close:110,unadjustedClose:110}],{day:'2026-09-10',close:111,unadjustedClose:111},{day:'2026-09-11',close:121,unadjustedClose:121})!;
 assert.deepEqual(bars.map(b=>b.close),[100,111,121]);
});
