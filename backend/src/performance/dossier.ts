import {buildDailyDisclosureIndex} from './daily.js';
import {db} from '../core/db.js';
import {queueDisclosurePriceRefresh,completedDay} from '../core/disclosure-prices.js';
import {calculateTransaction,flagAmendmentConflicts,reconcileLots,summarizeTransactions,type Tx,type Bar,type AmendmentRef} from './calculate.js';
import {instrumentFromSecurityTitle} from './instrument.js';

export {instrumentFromSecurityTitle} from './instrument.js';

export async function enrichDossierPerformance(transactions:any[],source:string,amendments:AmendmentRef[]=[]) {
  // Cap chart/summary work so heavy filers (hundreds of PTRs) stay interactive.
  const PERF_TXN_CAP = 180;
  const ranked = [...transactions].sort((a, b) => String(b?.ts ?? '').localeCompare(String(a?.ts ?? '')));
  const forPerf = ranked.length > PERF_TXN_CAP ? ranked.slice(0, PERF_TXN_CAP) : ranked;

  const txs:Tx[]=flagAmendmentConflicts(forPerf.map(t=>{
    const s=t.sheetRow,m=s.performanceMeta??{};
    const category=source==='politicians'?'politician':source==='institutions'?'institution':'insider';
    const code=String(s.transactionCode??s.transactionType??'');
    const action=category==='institution'?'holding':category==='insider'?(code==='P'?'buy':code==='S'?'sell':'other'):/^(p|purchase|buy)(\b|$)/i.test(code)?'buy':/^(s|sale|sell)(\b|$)/i.test(code)?'sell':'other';
    const instrument=
      category==='institution' ? (s.instrumentType ?? 'unclassified')
      : category==='politician' ? (/\[ST\]/i.test(s.assetName ?? '') ? 'shares' : 'unclassified')
      : instrumentFromSecurityTitle(m.securityTitle, s.isDerivative === true);
    return {id:s.transactionId,ticker:t.ticker,category,action,instrument,date:t.ts,filedAt:s.filedAt,observedAt:s.observedAt,filingId:s.filingId,sourceUrl:s.documentUrl,amountRange:s.amountRange,amountMid:s.amountUsdMid??s.amountUsd??null,shares:s.shares,meta:{...m,dateBasis:category==='politician'?'report_signature':'filing'},form:s.form,description:s.description,quality:s.quality};
  }),amendments);
  const tickers=[...new Set(['SPY',...txs.filter(t=>t.instrument==='shares'&&t.quality!=='legacy_unverified').map(t=>t.ticker)])];
  const cache=await db.queryApi<any>('SELECT ticker,bars,basis,fetched_at::text,as_of_day::text FROM disclosure_price_history WHERE ticker=ANY($1::text[])',[tickers]);
  const histories=new Map<string,Bar[]>(cache.filter(r=>r.basis==='split_adjusted_close').map(r=>[r.ticker,r.bars]));
  const needs=tickers.filter(t=>!histories.has(t)||cache.some(r=>r.ticker===t&&(!r.bars?.at(-1)?.unadjustedClose||r.as_of_day<completedDay())));
  for(const ticker of needs.slice(0,40))queueDisclosurePriceRefresh(ticker);
  const market=histories.get('SPY')??[];
  const results=txs.map(t=>calculateTransaction(t,histories.get(t.ticker)??[],market));
  const disclosures=txs.map(t=>calculateTransaction(t,histories.get(t.ticker)??[],market,'disclosure'));
  const positions=reconcileLots(txs,results);
  const strip=(r:any)=>{const {points,...rest}=r;return rest;};
  return {version:2,daily:buildDailyDisclosureIndex(results,histories,market),transactions:results.map(strip),disclosures:disclosures.map(strip),positions,
    summaries:[30,90,180].flatMap(h=>['buy','sell','holding'].map(a=>summarizeTransactions(results,h,a))),
    coverage:{records:txs.length,sourceRecords:transactions.length,priced:results.filter(r=>r.returnFraction!=null).length,unpriced:results.filter(r=>r.returnFraction==null).length,pendingTickers:needs.length,limit:PERF_TXN_CAP,historyComplete:false},
    methodology:'Security price returns from a reported execution price only when its split basis is verified; otherwise from the transaction-day close (next observed market session on a holiday). 13F uses quarter-end close. No dividends, fees or taxes. Equal-weight outcomes use one close-to-close ticker/date/action observation and a fixed horizon. Sales show subsequent stock movement, not short profit. PTR dollar bands use the midpoint of the disclosed range for sizing only; the band text remains the filing fact. Position P&L is withheld unless a disclosed-lot FIFO model can reconcile all available Form 4 transactions from a verified zero balance (Closed / Open at last disclosure).'};
}
