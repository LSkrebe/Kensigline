import test from 'node:test';
import assert from 'node:assert/strict';
import {averageInvestorReturns,annualWindow,availableHistoryReturns,cohortWindowSeries} from './cohort.js';
test('cohorts weight investors equally, deduplicate stocks and omit unpriced securities',()=>{
 const rows=[{kind:'insiders',filer_id:'a',ticker:'X'},{kind:'insiders',filer_id:'a',ticker:'X'},{kind:'insiders',filer_id:'a',ticker:'Y'},{kind:'insiders',filer_id:'b',ticker:'Y'},{kind:'politicians',filer_id:'c',ticker:'missing'}];
 const groups=averageInvestorReturns(rows,new Map([['X',0.1],['Y',0.3]]));
 assert.equal(groups[0]?.returnFraction,0.25);assert.equal(groups[0]?.investors,2);assert.equal(groups[1]?.returnFraction,null);assert.equal(groups[2]?.returnFraction,null);
});

test('annual window uses the same calendar year regardless of return sign',()=>{
 assert.deepEqual(annualWindow(['2026-09-11','2025-09-11','2025-09-12']),{start:'2025-09-11',end:'2026-09-11'});
 assert.deepEqual(annualWindow(['2026-09-13','2025-09-15']),{start:'2025-09-15',end:'2026-09-13'});
 assert.throws(()=>annualWindow(['2026-08-12','2026-09-11']),/annual_history_pending/);
});

test('available history starts after disclosure and does not annualize shorter records',()=>{
 const bars=new Map([['X',[{day:'2025-09-11',close:100},{day:'2026-06-01',close:200},{day:'2026-09-11',close:220}]]]);
 const result=availableHistoryReturns([{kind:'institutions',filer_id:'a',ticker:'X',first_day:'2026-06-01'}],bars,'2025-09-11','2026-09-11');
 assert.ok(Math.abs(result[2]!.returnFraction!-0.1)<1e-12);
 assert.equal(result[2]!.investors,1);
 assert.equal(availableHistoryReturns([{kind:'institutions',filer_id:'a',ticker:'X',first_day:'2026-09-11'}],bars,'2025-09-11','2026-09-11')[2]!.returnFraction,null);
});

test('available history uses last bar on or before window end when exact end is missing',()=>{
 const bars=new Map([['X',[{day:'2025-09-11',close:100},{day:'2026-06-01',close:110},{day:'2026-09-10',close:121}]]]);
 const result=availableHistoryReturns([{kind:'insiders',filer_id:'a',ticker:'X',first_day:'2025-09-11'}],bars,'2025-09-11','2026-09-11');
 assert.ok(Math.abs(result[0]!.returnFraction!-0.21)<1e-12);
});

test('leaders rank investor averages with deterministic ties, not individual winning stocks',()=>{
 const rows=[{kind:'insiders',filer_id:'a',ticker:'X'},{kind:'insiders',filer_id:'a',ticker:'Y'},{kind:'insiders',filer_id:'b',ticker:'Z'},{kind:'insiders',filer_id:'c',ticker:'Z'}];
 const result=averageInvestorReturns(rows,new Map([['X',1],['Y',-1],['Z',0.2]]));
 assert.equal(result[0]!.leaders[0]!.filerId,'b');assert.equal(result[0]!.leaders[0]!.returnFraction,0.2);assert.deepEqual(result[1]!.leaders,[]);
 assert.equal(result[0]!.members.length,3);
});

test('month window starts at zero and tracks investors against the market',()=>{
 const bars=new Map([
  ['SPY',[{day:'2026-09-01',close:100},{day:'2026-09-02',close:110},{day:'2026-09-03',close:120}]],
  ['X',[{day:'2026-09-01',close:50},{day:'2026-09-02',close:55},{day:'2026-09-03',close:60}]],
 ]);
 const series=cohortWindowSeries(
  [{kind:'insiders',filer_id:'a',ticker:'X',first_day:'2026-09-01'}],
  bars,
  ['2026-09-01','2026-09-02','2026-09-03'],
  '2026-09-01',
  '2026-09-03',
 );
 assert.equal(series?.points[0]?.investors,0);
 assert.equal(series?.points[0]?.spy,0);
 assert.ok(Math.abs(series!.points.at(-1)!.investors-0.2)<1e-12);
 assert.ok(Math.abs(series!.points.at(-1)!.spy-0.2)<1e-12);
});
