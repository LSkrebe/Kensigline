import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateTransaction,flagAmendmentConflicts,reconcileLots,summarizeTransactions,type Tx,type Bar} from './calculate.js';
const tx:Tx={id:'a',ticker:'ABC',category:'insider',action:'buy',instrument:'shares',date:'2026-01-02',filedAt:'2026-01-06',observedAt:'2026-01-07',filingId:'f1',sourceUrl:'https://sec.gov/filing',shares:100};
const prices:Bar[]=[{day:'2026-01-02',close:10,unadjustedClose:100},{day:'2026-01-05',close:11,unadjustedClose:110},{day:'2026-01-07',close:12,unadjustedClose:120},{day:'2026-02-02',close:15,unadjustedClose:15},{day:'2026-04-02',close:20,unadjustedClose:20}];
const market=prices.map(b=>({...b,close:100,unadjustedClose:100}));
test('range disclosures stay ranges and do not create personal profit',()=>{const r=calculateTransaction({...tx,category:'politician',amountRange:'$1,001 - $15,000'},prices,market);assert.equal(r.returnFraction,1);assert.equal(r.realizedPnl,null);assert.equal(r.unrealizedPnl,null);assert.equal(r.baselineBasis,'Transaction-day close proxy');assert.equal(r.delayDays,4);});
test('execution price is converted across a ten-for-one split',()=>{const r=calculateTransaction({...tx,meta:{price:80}},prices,market);assert.equal(r.baselinePrice,8);assert.equal(r.returnFraction,1.5);});
test('without unadjusted history a reported execution price is displayed but not mixed into adjusted returns',()=>{const r=calculateTransaction({...tx,meta:{price:80}},prices.map(({unadjustedClose,...b})=>b),market);assert.equal(r.disclosedPrice,80);assert.equal(r.baselinePrice,10);});
test('holiday uses next market session; missing stock bar on that session fails closed',()=>{const weekend={...tx,date:'2026-01-03'};assert.equal(calculateTransaction(weekend,prices,market).baselineDay,'2026-01-05');assert.equal(calculateTransaction(weekend,prices.filter(b=>b.day!=='2026-01-05'),market).returnFraction,null);});
test('13F quarter end uses last session on or before the snapshot, not a fabricated purchase date',()=>{const r=calculateTransaction({...tx,category:'institution',action:'holding',date:'2026-01-04'},prices,market);assert.equal(r.baselineDay,'2026-01-02');assert.equal(r.baselineBasis,'Quarter-end close');});
test('disclosure clock excludes the filing day and never uses ingestion as publication',()=>{assert.equal(calculateTransaction(tx,prices,market,'disclosure').baselineDay,'2026-01-07');assert.equal(calculateTransaction({...tx,filedAt:null},prices,market,'disclosure').returnFraction,null);});
test('options, unverified mappings and unresolved amendments never receive stock performance',()=>{for(const patch of [{instrument:'derivative'},{quality:'legacy_unverified'},{form:'Form 4/A'},{meta:{amendmentConflict:true}}]) assert.equal(calculateTransaction({...tx,...patch},prices,market).returnFraction,null);});
test('sale return remains the stock move and does not become a short profit',()=>assert.equal(calculateTransaction({...tx,action:'sell'},prices,market).returnFraction,1));
test('fixed horizon equal weights deduplicate repeated purchases on a ticker/date',()=>{const a=calculateTransaction(tx,prices,market);const b={...a,id:'b'};const c=calculateTransaction({...tx,id:'c',date:'2026-04-02'},prices,market);const result=summarizeTransactions([a,b,c],90);assert.equal(result.measured,1);assert.equal(result.duplicates,1);assert.equal(result.unmeasured,1);assert.equal(result.meanReturn,1);});
function lotsInput(){const meta={securityTitle:'Common Stock',ownership:'D',jointOwners:false,footnoteIds:[],ordinal:0};const ts:Tx[]=[{...tx,meta:{...meta,price:100,sharesAfter:100}},{...tx,id:'b',date:'2026-01-05',filingId:'f2',shares:50,meta:{...meta,price:110,sharesAfter:150}},{...tx,id:'c',date:'2026-01-07',filingId:'f3',action:'sell',shares:120,meta:{...meta,price:120,sharesAfter:30}},{...tx,id:'d',date:'2026-02-02',filingId:'f4',action:'sell',shares:300,meta:{...meta,price:15,sharesAfter:0}}];return ts;}
test('multiple buys, partial sale, split and final sale reconcile disclosed FIFO lots',()=>{const ts=lotsInput();const rows=ts.map(t=>calculateTransaction(t,prices,market));const partial=reconcileLots(ts.slice(0,3),rows)[0];assert.equal(partial.remainingShares,300);assert.equal(partial.realizedModelPnl,2200);assert.equal(partial.status,'Open at last disclosure');const closed=reconcileLots(ts,rows)[0];assert.equal(closed.remainingShares,0);assert.equal(closed.realizedModelPnl,3400);assert.equal(closed.unrealizedModelPnl,0);});
test('unknown opening holdings, awards, ambiguous footnotes and inconsistent balances withhold modeled PnL',()=>{for(const change of [{meta:{...lotsInput()[0]!.meta,sharesAfter:200}},{action:'other'},{meta:{...lotsInput()[0]!.meta,footnoteIds:['F1']}}]){const ts=lotsInput();ts[0]={...ts[0]!,...change};assert.deepEqual(reconcileLots(ts,ts.map(t=>calculateTransaction(t,prices,market))),[]);}});
test('a missing latest stock session retains an explicit stale as-of, never marks forward',()=>{const r=calculateTransaction(tx,prices.slice(0,-1),market);assert.equal(r.latestDay,'2026-02-02');assert.equal(r.stale,true);});

test('missing benchmark data does not turn an open exchange session into a holiday',()=>{assert.equal(calculateTransaction({...tx,date:'2026-01-05'},prices,market.filter(b=>b.day!=='2026-01-05')).returnFraction,null);});
test('House signature does not stand in for public availability',()=>{assert.equal(calculateTransaction({...tx,meta:{dateBasis:'report_signature'}},prices,market,'disclosure').returnFraction,null);});

test('amendments quarantine same-date records and corrected-date originals without affecting unrelated filings',()=>{
 const correction={...tx,id:'correction',date:'2026-01-05',filedAt:'2026-01-08',form:'Form 4/A',meta:{originalFiledDate:'2026-01-06'}};
 const unrelated={...tx,id:'unrelated',date:'2026-01-07',filedAt:'2026-01-09'};
 const rows=flagAmendmentConflicts([tx,correction,unrelated]);
 assert.equal(calculateTransaction(rows[0]!,prices,market).reason,'Amendment unresolved');
 assert.equal(calculateTransaction(rows[1]!,prices,market).returnFraction,null);
 assert.equal(rows[2]!.meta?.amendmentConflict,undefined);
});

test('an institutional amendment outside the history window withholds the affected quarter',()=>{
 const holding={...tx,category:'institution',action:'holding'};
 const refs=[{...holding,ticker:'OTHER',form:'13F/A'}];
 assert.equal(flagAmendmentConflicts([holding],refs)[0]!.meta.amendmentConflict,true);
});

test('date cohorts use closing prices, independent of arbitrary same-day execution-row order',()=>{
 const a=calculateTransaction({...tx,meta:{price:80}},prices,market);
 const b=calculateTransaction({...tx,id:'b',meta:{price:120}},prices,market);
 assert.equal(summarizeTransactions([a,b],90).meanReturn,1);
 assert.deepEqual(summarizeTransactions([a,b],90).meanReturn,summarizeTransactions([b,a],90).meanReturn);
});
