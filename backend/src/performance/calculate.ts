import {marketSession} from "./calendar.js";
/** Deterministic disclosure analytics. A market return is never labeled personal P&L. */
export type Bar = {day:string;close:number;unadjustedClose?:number};
export type Tx = {id:string;ticker:string;category:string;action:string;instrument:string;date:string|null;filedAt:string|null;observedAt:string|null;filingId:string;sourceUrl:string|null;amountRange?:string|null;shares?:number|null;meta?:any;form?:string|null;description?:string|null;quality?:string};
/** An amendment can correct the date or ticker itself; quarantine the referenced filing too. */
export type AmendmentRef = Pick<Tx,'ticker'|'date'|'filedAt'|'form'|'meta'|'category'>;
export function flagAmendmentConflicts(txs:Tx[], external:AmendmentRef[]=[]):Tx[] {
  const amendments=[...external,...txs.filter(t=>t.meta?.amendment||/\/A\b/i.test(t.form??''))];
  const quarters=new Set<string>(), tickerDates=new Set<string>(), originals=new Set<string>();
  for(const a of amendments) {
    const day=validDay(a.date), original=validDay(a.meta?.originalFiledDate);
    if(day) {if(a.category==='institution')quarters.add(day);else tickerDates.add(`${a.ticker}:${day}`);}
    if(original) originals.add(original);
  }
  return txs.map(t=>{
    const day=validDay(t.date), filed=validDay(t.filedAt);
    const conflict=(day!=null&&(quarters.has(day)||tickerDates.has(`${t.ticker}:${day}`)))||(filed!=null&&originals.has(filed));
    return conflict?{...t,meta:{...t.meta,amendmentConflict:true}}:t;
  });
}
const DAY=86400000;
export function validDay(raw:unknown):string|null {
  const d=typeof raw==='string'?raw.slice(0,10):'';
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0,10)===d ? d:null;
}
const add=(d:string,n:number)=>new Date(Date.parse(d)+n*DAY).toISOString().slice(0,10);
const delta=(a:string,b:string)=>Math.round((Date.parse(a)-Date.parse(b))/DAY);
export function cleanBars(bars:Bar[]):Bar[] {
  const seen=new Map<string,Bar>();
  for(const b of bars) if(validDay(b.day) && Number.isFinite(b.close) && b.close>0) {
    if(seen.has(b.day) && seen.get(b.day)!.close!==b.close) return []; // conflicting observations fail closed
    seen.set(b.day,b);
  }
  return [...seen.values()].sort((a,b)=>a.day.localeCompare(b.day));
}
function baseline(bars:Bar[],market:Bar[],date:string,after=false) {
  const target=after?add(date,1):date;
  // SPY supplies observed exchange sessions; never silently substitute a later stock bar for a missing session.
  const sessionDay=marketSession(target);
  const session=market.find(b=>b.day===sessionDay);
  if(!session || delta(session.day,target)>7) return null;
  return bars.find(b=>b.day===session.day) ?? null;
}
export function calculateTransaction(tx:Tx,rawBars:Bar[],rawMarket:Bar[],clock:'transaction'|'disclosure'='transaction') {
  const bars=cleanBars(rawBars),market=cleanBars(rawMarket);
  const date=validDay(tx.date),filed=validDay(tx.filedAt);
  const anchor=clock==='disclosure'?filed:date;
  const meta=tx.meta??{};
  const amendment=Boolean(meta.amendment)||/\/A\b/i.test(tx.form??'');
  const result:any={id:tx.id,ticker:tx.ticker,action:tx.action,instrument:tx.instrument,transactionDate:date,filedAt:filed,observedAt:validDay(tx.observedAt),clock,
    dateBasis:meta.dateBasis??"filing",
    delayDays:date&&filed&&filed>=date?delta(filed,date):null,
    disclosedPrice:Number.isFinite(meta.price)&&meta.price>0?meta.price:null,
    priceQualification:meta.footnoteIds?.length?'Reported price; see filing footnotes (may be a weighted average).':null,
    amountRange:tx.amountRange??null,shares:tx.shares??null,
    positionStatus:tx.category==='institution'?'Quarter-end snapshot; current holding unknown':'Current holding unknown',
    realizedPnl:null,unrealizedPnl:null,returnFraction:null,excessFraction:null,points:[],windows:{},reason:null};
  if(meta.sharesAfter!=null && Number.isFinite(meta.sharesAfter) && meta.sharesAfter>=0 && !meta.jointOwners && !amendment && !meta.amendmentConflict) {
    result.disclosedSharesAfter=meta.sharesAfter;
    result.positionStatus=meta.sharesAfter===0?'Reported zero after this transaction':'Reported holding after this transaction';
  }
  if(amendment || meta.amendmentConflict) result.reason='Amendment unresolved';
  else if(tx.quality==='legacy_unverified') result.reason='Source mapping unverified';
  else if(tx.instrument!=='shares') result.reason=tx.instrument==='derivative'?'Option return unavailable; underlying stock is not the option':'Security class unverified';
  else if(clock==='disclosure'&&meta.dateBasis==='report_signature') result.reason='Publication date unavailable; report signature is not publication';
  else if(!anchor) result.reason=clock==='disclosure'?'Publication date unavailable':'Transaction date unavailable';
  else if(!tx.sourceUrl) result.reason='Source filing unavailable';
  if(result.reason) return result;
  const quarterSession=tx.category==='institution'&&clock==='transaction' ? market.find(b=>b.day===marketSession(anchor!,-1)):null;
  const entry=tx.category==='institution'&&clock==='transaction' ? (quarterSession && delta(anchor!,quarterSession.day)<=7 ? bars.find(b=>b.day===quarterSession.day):null) : baseline(bars,market,anchor!,clock==='disclosure');
  if(!entry) {result.reason='Baseline market price unavailable';return result;}
  const last=bars.at(-1)!;
  if(last.day<entry.day) {result.reason='No subsequent market price';return result;}
  const latestMarket=market.at(-1);
  const benchmarkEntry=market.find(b=>b.day===entry.day),benchmarkEnd=market.find(b=>b.day===last.day);
  let entryPrice=entry.close;
  result.baselineBasis=tx.category==='institution'?'Quarter-end close':'Transaction-day close proxy';
  if(clock==='disclosure') result.baselineBasis='First market close after disclosure date';
  // Reported prices are unadjusted. Only compare them after converting to the same split basis as this exact provider snapshot.
  if(clock==='transaction' && result.disclosedPrice && Number.isFinite(entry.unadjustedClose) && entry.unadjustedClose!>0 && entry.day===date) {
    const factor=entry.unadjustedClose!/entry.close;
    entryPrice=result.disclosedPrice/factor;
    result.splitFactor=factor;
    result.baselineBasis='Reported execution price, split-adjusted';
  }
  result.baselineDay=entry.day;result.baselinePrice=entryPrice;result.baselineClose=entry.close;
  result.baselineUnadjustedClose=entry.unadjustedClose??null;
  result.latestDay=last.day;result.latestClose=last.close;
  result.stale=latestMarket ? last.day<latestMarket.day : true;
  result.returnFraction=last.close/entryPrice-1;
  result.excessFraction=benchmarkEntry&&benchmarkEnd ? result.returnFraction-(benchmarkEnd.close/benchmarkEntry.close-1):null;
  result.points=bars.filter(b=>b.day>=entry.day).map(b=>({day:b.day,ts:b.day+'T12:00:00Z',cumulative:b.close/entryPrice-1,close:b.close}));
  for(const horizon of [30,90,180]) {
    const target=add(entry.day,horizon);
    const exit=baseline(bars,market,target);
    if(!exit) {result.windows[horizon]={reason:latestMarket&&target>latestMarket.day?'Not mature':'Price unavailable'};continue;}
    const marketExit=market.find(b=>b.day===exit.day);
    result.windows[horizon]={closeReturnFraction:exit.close/entry.close-1,closeExcessFraction:marketExit&&benchmarkEntry?exit.close/entry.close-marketExit.close/benchmarkEntry.close:null,returnFraction:exit.close/entryPrice-1,excessFraction:marketExit&&benchmarkEntry?exit.close/entryPrice-marketExit.close/benchmarkEntry.close:null,exitDay:exit.day};
  }
  return result;
}
/** Equal-weight same-horizon stock outcomes; never sum percentages into a portfolio return. */
export function summarizeTransactions(results:any[],horizon=90,action='buy') {
  const selected=results.filter(r=>r.action===action);
  const seen=new Set<string>();let duplicates=0;
  const cohort=selected.filter(r=>{
    if(r.reason || r.windows[horizon]?.closeReturnFraction==null)return false;
    const key=`${r.ticker}:${r.baselineDay}:${r.action}`;
    if(seen.has(key)){duplicates++;return false;}seen.add(key);return true;
  });
  const mean=(key:string)=>cohort.length?cohort.reduce((sum,r)=>sum+r.windows[horizon][key],0)/cohort.length:null;
  return {horizon,action,total:selected.length,measured:cohort.length,duplicates,unmeasured:selected.length-cohort.length-duplicates,
    meanReturn:mean('closeReturnFraction'),meanExcess:cohort.every(r=>r.windows[horizon].closeExcessFraction!=null)?mean('closeExcessFraction'):null,
    positiveRate:cohort.length?cohort.filter(r=>r.windows[horizon].closeReturnFraction>0).length/cohort.length:null,
    best:cohort.slice().sort((a,b)=>b.windows[horizon].closeReturnFraction-a.windows[horizon].closeReturnFraction).slice(0,5).map(r=>r.id),
    worst:cohort.slice().sort((a,b)=>a.windows[horizon].closeReturnFraction-b.windows[horizon].closeReturnFraction).slice(0,5).map(r=>r.id)};
}
/** Optional disclosed-lot FIFO model. Requires a verified zero opening balance and reconciliation after every transaction. */
export function reconcileLots(transactions:Tx[],results:any[]) {
  const byId=new Map(results.map(r=>[r.id,r]));
  const groups=new Map<string,Tx[]>();
  for(const t of transactions) {
    const m=t.meta;
    if(t.category!=='insider'||!m?.securityTitle||m.ownership!=='D'||m.jointOwners)continue;
    const key=`${t.ticker}:${m.securityTitle}:${m.ownership}`;
    groups.set(key,[...(groups.get(key)??[]),t]);
  }
  const positions:any[]=[];
  for(const [key,raw] of groups) {
    const txs=raw.slice().sort((a,b)=>(a.date??'').localeCompare(b.date??'') || (a.filedAt??'').localeCompare(b.filedAt??'') || a.filingId.localeCompare(b.filingId) || (a.meta.ordinal??0)-(b.meta.ordinal??0));
    let lots:{qty:number;cost:number;id:string}[]=[];let realized=0;let valid=true;let started=false;let latest:any=null;
    for(const t of txs) {
      const r=byId.get(t.id),m=t.meta;
      if(!r || r.reason || !r.splitFactor || !['buy','sell'].includes(t.action) || !(t.shares!>0) || !Number.isFinite(m.sharesAfter) || m.amendment || m.footnoteIds?.length) {valid=false;break;}
      const qty=t.shares!*r.splitFactor, after=m.sharesAfter*r.splitFactor;
      if(!started) {if(t.action!=='buy'||Math.abs(after-qty)>1e-5){valid=false;break;}started=true;}
      // Unknown order across independent filings on the same day cannot define realized cost basis.
      if(txs.some(o=>o.id!==t.id&&o.date===t.date&&o.filingId!==t.filingId)){valid=false;break;}
      if(t.action==='buy') lots.push({qty,cost:r.baselinePrice,id:t.id});
      else {
        let remaining=qty;
        while(remaining>1e-8&&lots.length){const lot=lots[0]!;const matched=Math.min(remaining,lot.qty);realized+=matched*(r.baselinePrice-lot.cost);lot.qty-=matched;remaining-=matched;if(lot.qty<1e-8)lots.shift();}
        if(remaining>1e-5){valid=false;break;}
      }
      if(Math.abs(lots.reduce((s,l)=>s+l.qty,0)-after)>Math.max(1e-5,after*1e-8)){valid=false;break;}
      latest=r;
    }
    if(!valid||!started||!latest)continue;
    positions.push({key,ticker:txs[0]!.ticker,status:lots.length?'Open at last disclosure':'Closed at last disclosure',asOf:txs.at(-1)!.date,
      remainingShares:lots.reduce((s,l)=>s+l.qty,0),realizedModelPnl:realized,
      unrealizedModelPnl:lots.reduce((s,l)=>s+l.qty*(latest.latestClose-l.cost),0),priceAsOf:latest.latestDay,
      methodology:'Reconciled disclosed-lot FIFO model in split-adjusted units; excludes fees, dividends and taxes. Current holdings and actual tax-lot choices are not known.'});
  }
  return positions;
}
