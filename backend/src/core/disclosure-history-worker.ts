import {db} from './db.js';
import {grouped} from './disclosure-bulk-prices.js';
import {completedDay} from './disclosure-prices.js';
import {marketSession} from '../performance/calendar.js';
let busy=false;
const pause=()=>new Promise(r=>setTimeout(r,15000));
/** Bulk historical fills use the current overlap close to convert into each stored snapshot's
 * split basis. Existing bars win; no missing sessions or raw execution prices are invented. */
export async function backfillDailyHistory(batch=5){
 if(busy)return;busy=true;
 try{
  await db.queryApi('CREATE TABLE IF NOT EXISTS disclosure_history_days(day date PRIMARY KEY,completed_at timestamptz NOT NULL DEFAULT now(),symbols integer NOT NULL)');
  const target=completedDay();
  const done=new Set((await db.queryApi<{day:string}>('SELECT day::text FROM disclosure_history_days')).map(r=>r.day));
  const floor=new Date(Date.parse(target)-730*86400000).toISOString().slice(0,10);
  let candidate=marketSession(new Date(Date.parse(target)-2*86400000).toISOString().slice(0,10),-1);
  const days:string[]=[];
  while(candidate&&candidate>=floor&&days.length<batch){if(!done.has(candidate))days.push(candidate);candidate=marketSession(new Date(Date.parse(candidate)-86400000).toISOString().slice(0,10),-1);}
  if(!days.length)return;
  const anchor=await grouped(target,true);await pause();
  const anchorRaw=await grouped(target,false);await pause();
  for(const day of days){
   const prices=await grouped(day,true);
   const records=[...prices].filter(([ticker])=>anchor.has(ticker)&&anchorRaw.has(ticker)).map(([ticker,close])=>({ticker,close,anchor:anchor.get(ticker),anchor_raw:anchorRaw.get(ticker)}));
   let symbols=0;
   for(let i=0;i<records.length;i+=200){
    const result=await db.queryApi<{ticker:string}>(`UPDATE disclosure_price_history p SET bars=
      jsonb_build_array(jsonb_build_object('day',$2::text,'close',x.close*x.anchor_raw/x.anchor*(p.bars->-1->>'close')::double precision/(p.bars->-1->>'unadjustedClose')::double precision))||p.bars
      FROM jsonb_to_recordset($1::jsonb) x(ticker text,close double precision,anchor double precision,anchor_raw double precision)
      WHERE p.ticker=x.ticker AND p.as_of_day=$3::date AND p.basis='split_adjusted_close'
      AND (p.bars->-1->>'unadjustedClose')::double precision>0 AND p.bars->0->>'day'>$2::text RETURNING p.ticker`,[JSON.stringify(records.slice(i,i+200)),day,target],30000);
    symbols+=result.length;
   }
   await db.queryApi('INSERT INTO disclosure_history_days(day,symbols) VALUES($1::date,$2) ON CONFLICT(day) DO UPDATE SET completed_at=now(),symbols=EXCLUDED.symbols',[day,symbols]);
   console.info('[daily-history]',JSON.stringify({day,symbols}));await pause();
  }
  // Leave investor_dossier_cache intact — history backfill must not force cold dossier rebuilds.
 }finally{busy=false;}
}
export function startDisclosureHistoryWorker(){
 const run=()=>void backfillDailyHistory().catch(e=>console.warn('[daily-history]',e.message));
 const initial=setTimeout(run,120000),timer=setInterval(run,5*60000);
 return {stop(){clearTimeout(initial);clearInterval(timer);}};
}
