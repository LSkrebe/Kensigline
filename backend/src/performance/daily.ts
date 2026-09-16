import {cleanBars,type Bar} from './calculate.js';
/** Daily, equal-weight reference index of disclosed securities. This is NOT the filer's portfolio.
 * A symbol enters only AFTER its first eligible disclosure transaction date. Repeated rows do
 * not overweight it. Sales do not imply short positions or a known full exit. No missing-close
 * interpolation: missing securities are excluded for that interval; zero coverage ends the series.
 */
export function buildDailyDisclosureIndex(results:any[],histories:Map<string,Bar[]>,rawMarket:Bar[]) {
  const market=cleanBars(rawMarket);
  const starts=new Map<string,string>();
  for(const r of results) {
    if((r.reason&&r.reason!=='Baseline market price unavailable')||!r.transactionDate||!['buy','sell','holding'].includes(r.action))continue;
    const first=cleanBars(histories.get(r.ticker)??[])[0]?.day;
    if(!first)continue;
    const start=[r.baselineDay??r.transactionDate,first].sort().at(-1)!;
    const old=starts.get(r.ticker);
    if(!old||start<old)starts.set(r.ticker,start);
  }
  const prices=new Map([...starts.keys()].map(t=>[t,new Map(cleanBars(histories.get(t)??[]).map(b=>[b.day,b.close]))]));
  let level=1, missingSessions=0;
  const points:{ts:string;day:string;cumulative:number;constituents:number}[]=[];
  for(let i=0;i<market.length;i++) {
    const day=market[i]!.day,previous=market[i-1]?.day;
    const active=[...starts].filter(([,start])=>previous!=null&&start<=previous).map(([t])=>t);
    if(!active.length)continue;
    const priced=active.filter(t=>prices.get(t)?.has(day)&&prices.get(t)?.has(previous!));
    if(priced.length<active.length)missingSessions++;
    if(!priced.length)break;
    if(!points.length)points.push({ts:previous+'T12:00:00Z',day:previous!,cumulative:0,constituents:priced.length});
    level*=1+priced.reduce((s,t)=>s+prices.get(t)!.get(day)!/prices.get(t)!.get(previous!)!-1,0)/priced.length;
    points.push({ts:day+'T12:00:00Z',day,cumulative:level-1,constituents:priced.length});
  }
  return {points,symbols:starts.size,missingSessions,asOf:points.at(-1)?.day??null,
    label:'Disclosed-stock index',
    methodology:'Daily equal-weight, split-adjusted price index of identifiable stocks in the available disclosures. Each stock enters after its first eligible transaction or quarter-end snapshot and its first available price. Securities missing either closing price are excluded from that day’s equal weighting; coverage varies and historical fills can revise the index. Repeated trades do not increase its weight; sales are not shorts and do not prove a full exit. This reference basket is not actual holdings or personal P&L. Excludes dividends, fees, taxes and unpriced securities.'};
}
