import {mergeDailyCloses} from '../performance/daily-price.js';
import {db} from './db.js';
import {marketSession} from '../performance/calendar.js';
import {completedDay,queueDisclosurePriceRefresh,priceProviderFetch} from './disclosure-prices.js';
type Bar={day:string;close:number;unadjustedClose?:number};
let active=false;
let lastAttempt=0;
let lastCompleted='';
export async function grouped(day:string,adjusted:boolean) {
 const key=process.env.POLYGON_API_KEY?.trim();if(!key)throw Error('price_provider_not_configured');
 const url=new URL(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${day}`);
 url.search=new URLSearchParams({apiKey:key,adjusted:String(adjusted),include_otc:'true'}).toString();
 const response=await priceProviderFetch(url);
 if(!response.ok)throw Error(`bulk_prices_http_${response.status}`);
 const data=await response.json() as any;
 if(data.adjusted!==adjusted||!Array.isArray(data.results)||data.results.length<100)throw Error('bulk_price_basis_or_coverage_unconfirmed');
 return new Map<string,number>(data.results.filter((b:any)=>typeof b.T==='string'&&Number.isFinite(b.c)&&b.c>0&&new Date(b.t).toISOString().slice(0,10)===day).map((b:any)=>[b.T,b.c]));
}
const wait=()=>new Promise(r=>setTimeout(r,13000));
/** Rebase a complete prior history using a same-provider overlapping daily close before appending. */
export async function refreshDailyMarket(force=false) {
 const day=completedDay();
 if(active||(!force&&(lastCompleted===day||Date.now()-lastAttempt<15*60000)))return;
 active=true;lastAttempt=Date.now();
 try {
  const previousDay=marketSession(new Date(Date.parse(day)-86400000).toISOString().slice(0,10),-1)!;
  const now=await grouped(day,true);await wait();const raw=await grouped(day,false);await wait();
  const previous=await grouped(previousDay,true);await wait();const previousRaw=await grouped(previousDay,false);
  const rows=await db.queryApi<{ticker:string;bars:Bar[]|null}>(`SELECT i.ticker,p.bars FROM issuers i LEFT JOIN disclosure_price_history p ON p.ticker=i.ticker WHERE i.ticker ~ '^[A-Z][A-Z0-9.-]{0,9}$' UNION SELECT 'SPY',p.bars FROM (SELECT 1) x LEFT JOIN disclosure_price_history p ON p.ticker='SPY'`,[],30000);
  const updates=new Map<string,Bar[]>();let missing=0;
  for(const row of rows) {
   const t=row.ticker;
   if(!now.has(t)||!raw.has(t)||!previous.has(t)||!previousRaw.has(t)){missing++;continue;}
   const merged=mergeDailyCloses(row.bars??[],{day:previousDay,close:previous.get(t)!,unadjustedClose:previousRaw.get(t)!},{day,close:now.get(t)!,unadjustedClose:raw.get(t)!});
   if(!merged){queueDisclosurePriceRefresh(t);continue;}
   updates.set(t,merged);
  }
  const entries=[...updates].map(([ticker,bars])=>({ticker,bars}));
  for(let i=0;i<entries.length;i+=100)await db.queryApi(`INSERT INTO disclosure_price_history(ticker,provider,basis,as_of_day,fetched_at,bars)
   SELECT x.ticker,'polygon','split_adjusted_close',$2::date,now(),x.bars FROM jsonb_to_recordset($1::jsonb) x(ticker text,bars jsonb)
   ON CONFLICT(ticker) DO UPDATE SET bars=EXCLUDED.bars,as_of_day=EXCLUDED.as_of_day,fetched_at=now(),provider=EXCLUDED.provider,basis=EXCLUDED.basis`,[JSON.stringify(entries.slice(i,i+100)),day],30000);
  // Dossier materializations embed prices; fresh daily prices must replace these snapshots.
  await db.queryApi('DELETE FROM investor_dossier_cache');
  await db.queryApi('DELETE FROM company_dossier_cache');
  lastCompleted=day;console.info('[daily-market] completed',JSON.stringify({day,updated:updates.size,missing}));
  return {day,updated:updates.size,missing};
 } finally {active=false;}
}
export function startDailyMarketWorker(){
 const run=()=>void refreshDailyMarket().catch(e=>console.warn('[daily-market]',e.message));
 const initial=setTimeout(run,5000),timer=setInterval(run,5*60000);
 return {stop(){clearTimeout(initial);clearInterval(timer);}};
}
