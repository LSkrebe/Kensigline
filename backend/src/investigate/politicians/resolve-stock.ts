/** Exact, unique issuer-name matching only. No fuzzy OCR substitutions or guessed tickers. */
export function resolveStockNames<T extends {ticker:string|null;asset_name:string|null;asset_type:string|null}>(rows:T[],titles:Map<string,string>):T[]{
 const normalize=(s:string)=>s.toUpperCase().replace(/&/g,' AND ').replace(/[^A-Z0-9 ]/g,' ').replace(/\b(INCORPORATED|INC|CORPORATION|CORP|COMPANY|CO|PLC|LTD)\b/g,' ').replace(/\s+/g,' ').trim();
 const names=new Map<string,string[]>();
 for(const [ticker,title] of titles){const key=normalize(title);names.set(key,[...(names.get(key)??[]),ticker]);}
 return rows.map(row=>{
  if(row.ticker||!row.asset_name||/\b(bond|note|due|treasury|municipal|debenture|option|warrant|fund|ETF|preferred)\b/i.test(row.asset_name))return row;
  const hits=names.get(normalize(row.asset_name));
  return hits?.length===1?{...row,ticker:hits[0]!,asset_type:'ST',asset_name:row.asset_name+' [ST]'}:row;
 });
}
